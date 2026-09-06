import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';
import AgentChat from '../components/AgentChat.jsx';

const STAGE_COLORS = {
  'Closed Won': 'pill-won',
  'Closed Lost': 'pill-lost',
};

function stagePill(stage) {
  return `pill ${STAGE_COLORS[stage] || 'pill-open'}`;
}

function money(n) {
  return `$${Number(n).toLocaleString('en-US')}`;
}

export default function Workspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState('');
  const [q, setQ] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listOpportunities({
        stage: stageFilter || undefined,
        account_name: q || undefined,
      });
      setOpportunities(data.opportunities);
      if (!selectedId && data.opportunities[0]) setSelectedId(data.opportunities[0].id);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter, q]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    api
      .getOpportunity(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const totalOpen = useMemo(
    () =>
      opportunities
        .filter((o) => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost')
        .reduce((sum, o) => sum + o.amount, 0),
    [opportunities]
  );

  async function handleDataChanged() {
    await loadList();
    if (selectedId) {
      api.getOpportunity(selectedId).then(setDetail).catch(() => {});
    }
  }

  if (!user) return null;

  return (
    <div style={styles.shell}>
      <header style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>Z</div>
          <div>
            <div style={styles.brandName}>ZafinOS Sales Workspace</div>
            <div style={styles.brandSub}>Thin CRM · scoped agent</div>
          </div>
        </div>
        <div style={styles.topRight}>
          <div style={styles.whoami}>
            <span style={{ fontWeight: 700 }}>{user.first_name} {user.last_name}</span>
            <span className="pill" style={{ marginLeft: 8, textTransform: 'capitalize' }}>{user.role}</span>
          </div>
          {user.role === 'admin' && (
            <button style={styles.linkBtn} onClick={() => navigate('/audit-log')}>
              Audit log
            </button>
          )}
          <button
            style={styles.linkBtn}
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div style={styles.body}>
        <section style={styles.listPane}>
          <div style={styles.listHeader}>
            <div>
              <div style={styles.listTitle}>Opportunities</div>
              <div style={styles.listSub}>
                {loading ? 'Loading…' : `${opportunities.length} visible to you · ${money(totalOpen)} open`}
              </div>
            </div>
            <div style={styles.filters}>
              <input
                style={styles.search}
                placeholder="Filter by account…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select style={styles.select} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="">All stages</option>
                {['Discovery', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.tableWrap} className="scroll-y">
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Account</th>
                  <th style={styles.th}>Owner</th>
                  <th style={styles.th}>Stage</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    style={{ ...styles.tr, ...(o.id === selectedId ? styles.trActive : {}) }}
                  >
                    <td style={styles.td}>
                      <div style={{ fontWeight: 600 }}>{o.name}</div>
                      <div className="mono" style={{ color: '#94a0bc' }}>{o.id}</div>
                    </td>
                    <td style={styles.td}>{o.account_name}</td>
                    <td style={styles.td}>{o.owner_name}</td>
                    <td style={styles.td}><span className={stagePill(o.stage)}>{o.stage}</span></td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{money(o.amount)}</td>
                  </tr>
                ))}
                {!loading && opportunities.length === 0 && (
                  <tr>
                    <td style={styles.td} colSpan={5}>No opportunities match your filters, or none are visible to your role.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.detailPane} className="scroll-y">
          {detailLoading && <div style={styles.emptyState}>Loading…</div>}
          {!detailLoading && !detail && <div style={styles.emptyState}>Select an opportunity to see details.</div>}
          {!detailLoading && detail && (
            <div style={styles.detailInner}>
              <div style={styles.detailHeaderRow}>
                <div>
                  <div className="mono" style={{ color: '#94a0bc', marginBottom: 4 }}>{detail.opportunity.id}</div>
                  <h2 style={styles.detailTitle}>{detail.opportunity.name}</h2>
                </div>
                <span className={stagePill(detail.opportunity.stage)}>{detail.opportunity.stage}</span>
              </div>

              <div style={styles.factGrid}>
                <Fact label="Account" value={detail.account?.name} />
                <Fact label="Owner" value={detail.opportunity.owner_name} />
                <Fact label="Amount" value={money(detail.opportunity.amount)} />
                <Fact label="Close date" value={detail.opportunity.close_date} />
                <Fact label="Industry" value={detail.account?.industry} />
                <Fact label="Region" value={detail.account?.region} />
              </div>

              <div style={styles.sectionLabel}>Proposals</div>
              {detail.proposals.length === 0 && <div style={styles.mutedNote}>No proposals linked to this opportunity.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.proposals.map((p) => (
                  <div key={p.id} style={styles.proposalRow}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                      <div className="mono" style={{ color: '#94a0bc', fontSize: 11 }}>{p.id} · {p.submitted_date || 'not submitted'}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="pill">{p.status}</span>
                      <span style={{ fontWeight: 600 }}>{money(p.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside style={styles.chatPane}>
          <AgentChat userLabel={`${user.first_name} ${user.last_name}`} onDataChanged={handleDataChanged} />
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <div style={styles.factLabel}>{label}</div>
      <div style={styles.factValue}>{value || '—'}</div>
    </div>
  );
}

const styles = {
  shell: { display: 'flex', flexDirection: 'column', height: '100vh' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 20px', background: '#14213a', color: '#fff', flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandMark: { width: 30, height: 30, borderRadius: 7, background: '#0f5fd6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 },
  brandName: { fontWeight: 700, fontSize: 13.5 },
  brandSub: { fontSize: 11, color: '#9fb0d6' },
  topRight: { display: 'flex', alignItems: 'center', gap: 14 },
  whoami: { fontSize: 12.5 },
  linkBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '6px 11px', borderRadius: 7, fontSize: 12.5 },

  body: { flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr) 360px', minHeight: 0 },

  listPane: { display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)', minHeight: 0, background: 'var(--panel)' },
  listHeader: { padding: '16px 18px 12px', borderBottom: '1px solid var(--line)' },
  listTitle: { fontWeight: 700, fontSize: 15 },
  listSub: { fontSize: 12, color: '#6b7590', marginTop: 2 },
  filters: { display: 'flex', gap: 8, marginTop: 10 },
  search: { flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', fontSize: 12.5 },
  select: { padding: '7px 8px', borderRadius: 7, border: '1px solid var(--line)', fontSize: 12.5 },

  tableWrap: { flex: 1, overflowY: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.04, color: '#8890a6', padding: '9px 14px', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: '#fff' },
  tr: { cursor: 'pointer', borderBottom: '1px solid #eef0f6' },
  trActive: { background: 'var(--accent-soft)' },
  td: { padding: '10px 14px', fontSize: 12.5, verticalAlign: 'middle' },

  detailPane: { minHeight: 0, background: '#fbfcfe', borderRight: '1px solid var(--line)' },
  emptyState: { padding: 24, color: '#8890a6', fontSize: 13 },
  detailInner: { padding: '20px 22px' },
  detailHeaderRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  detailTitle: { fontSize: 18, fontWeight: 700, margin: '2px 0 0' },
  factGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px', margin: '20px 0 24px' },
  factLabel: { fontSize: 10.5, textTransform: 'uppercase', color: '#8890a6', marginBottom: 3 },
  factValue: { fontSize: 13.5, fontWeight: 600 },
  sectionLabel: { fontSize: 11.5, fontWeight: 700, color: '#4b5876', marginBottom: 10, textTransform: 'uppercase' },
  mutedNote: { fontSize: 12.5, color: '#8890a6', marginBottom: 12 },
  proposalRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: '#fff', border: '1px solid var(--line)', borderRadius: 8 },

  chatPane: { minHeight: 0, display: 'flex' },
};
