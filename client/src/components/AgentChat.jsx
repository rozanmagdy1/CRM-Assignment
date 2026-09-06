import React, { useRef, useState, useEffect } from 'react';
import { api } from '../api.js';

const STARTERS = [
  "What is my team's open pipeline this quarter?",
  'Summarize my pipeline by stage.',
  "Show me Jordan's opportunities.",
  "Show me Sam's opportunities.",
];

export default function AgentChat({ userLabel, onDataChanged }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi ${userLabel.split(' ')[0]}, I'm the ZafinOS dashboard agent. I can only see the accounts, opportunities, and proposals you're allowed to see — ask me about your pipeline.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastToolCalls, setLastToolCalls] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    setError('');
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setBusy(true);
    try {
      // API-shaped history: only role + content, plain strings for user turns.
      const apiMessages = next.map((m) => ({ role: m.role, content: m.content }));
      const res = await api.chat(apiMessages);
      setMessages((cur) => [...cur, { role: 'assistant', content: res.reply }]);
      setLastToolCalls(res.toolCalls || []);
      if ((res.toolCalls || []).some((t) => t.name.startsWith('create_') || t.name.startsWith('update_') || t.name.startsWith('delete_'))) {
        onDataChanged?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={styles.dot} />
        <div>
          <div style={styles.title}>Dashboard agent</div>
          <div style={styles.subtitle}>Scoped to {userLabel}</div>
        </div>
      </div>

      <div ref={scrollRef} style={styles.messages} className="scroll-y">
        {messages.map((m, i) => (
          <div key={i} style={m.role === 'user' ? styles.bubbleUserRow : styles.bubbleAgentRow}>
            <div style={m.role === 'user' ? styles.bubbleUser : styles.bubbleAgent}>{m.content}</div>
          </div>
        ))}
        {busy && (
          <div style={styles.bubbleAgentRow}>
            <div style={styles.bubbleAgent}>Thinking…</div>
          </div>
        )}
      </div>

      {lastToolCalls.length > 0 && (
        <div style={styles.toolTrace}>
          <span style={{ fontWeight: 700 }}>Tool calls: </span>
          {lastToolCalls.map((t, i) => (
            <span key={i} className="mono" style={styles.toolChip}>
              {t.name}
            </span>
          ))}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.starters}>
        {STARTERS.map((s) => (
          <button key={s} type="button" style={styles.starterBtn} onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <form
        style={styles.inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your pipeline…"
          disabled={busy}
        />
        <button style={styles.sendBtn} type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderLeft: '1px solid var(--line)' },
  header: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' },
  dot: { width: 8, height: 8, borderRadius: 99, background: '#1a7f5a', flexShrink: 0 },
  title: { fontWeight: 700, fontSize: 13.5 },
  subtitle: { fontSize: 11.5, color: '#6b7590' },
  messages: { flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  bubbleUserRow: { display: 'flex', justifyContent: 'flex-end' },
  bubbleAgentRow: { display: 'flex', justifyContent: 'flex-start' },
  bubbleUser: { background: '#0f5fd6', color: '#fff', padding: '9px 12px', borderRadius: '12px 12px 2px 12px', maxWidth: '85%', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  bubbleAgent: { background: '#f2f4f9', color: '#14213a', padding: '9px 12px', borderRadius: '12px 12px 12px 2px', maxWidth: '90%', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  toolTrace: { padding: '0 16px 8px', fontSize: 11, color: '#6b7590' },
  toolChip: { background: '#eef1f8', border: '1px solid var(--line)', borderRadius: 5, padding: '1px 6px', marginRight: 5 },
  error: { margin: '0 16px 8px', fontSize: 12.5, color: '#c0392b', background: '#fbeceb', border: '1px solid #f3c9c6', borderRadius: 7, padding: '7px 9px' },
  starters: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 10px' },
  starterBtn: { fontSize: 11.5, padding: '5px 9px', borderRadius: 999, border: '1px solid var(--line)', background: '#fff', color: '#4b5876' },
  inputRow: { display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--line)' },
  input: { flex: 1, padding: '9px 11px', borderRadius: 7, border: '1px solid var(--line)' },
  sendBtn: { padding: '9px 16px', borderRadius: 7, border: 'none', background: '#0f5fd6', color: '#fff', fontWeight: 700 },
};
