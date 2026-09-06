import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function AuditLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .auditLog()
      .then((d) => setEntries(d.entries))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate('/')} style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 7, padding: '6px 12px' }}>
          ← Back
        </button>
        <h2 style={{ margin: 0, fontSize: 17 }}>Tool audit log</h2>
      </div>
      <p style={{ color: '#6b7590', fontSize: 13, marginBottom: 16 }}>
        Every agent tool call: who called it, what tool, what arguments, and how many rows came back. Admin-only ({user?.first_name}).
      </p>
      {error && <div style={{ color: '#c0392b' }}>{error}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {['Time', 'User', 'Tool', 'Args', 'Rows / result'].map((h) => (
              <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', padding: '8px 10px', color: '#6b7590' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} style={{ borderBottom: '1px solid #eef0f6' }}>
              <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }} className="mono">{e.ts}</td>
              <td style={{ padding: '8px 10px' }}>{e.user_email}</td>
              <td style={{ padding: '8px 10px' }} className="mono">{e.tool_name}</td>
              <td style={{ padding: '8px 10px', maxWidth: 320 }} className="mono">{e.args_json}</td>
              <td style={{ padding: '8px 10px' }}>{e.result_summary || (e.result_count != null ? `${e.result_count} row(s)` : '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
