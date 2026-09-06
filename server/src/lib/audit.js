import { db } from './db.js';

const insert = db.prepare(`
  INSERT INTO tool_audit_log (user_id, user_email, tool_name, args_json, result_count, result_summary)
  VALUES (?, ?, ?, ?, ?, ?)
`);

/**
 * Logs a single tool invocation. Never logs secrets - only the user id/email
 * (already known to the session), the tool name, its arguments, and a shape
 * of the result (row count + a short summary), never full row payloads.
 */
export function logToolCall(user, toolName, args, result) {
  let count = null;
  if (Array.isArray(result)) count = result.length;
  else if (result && typeof result === 'object' && Array.isArray(result.rows)) count = result.rows.length;

  const summary = summarize(result);
  insert.run(user.id, user.email, toolName, JSON.stringify(args ?? {}), count, summary);
}

function summarize(result) {
  if (result == null) return null;
  if (Array.isArray(result)) return `${result.length} row(s)`;
  if (result.error) return `error: ${result.error}`;
  if (result.deleted) return `deleted ${result.id}`;
  if (result.id) return `record ${result.id}`;
  return null;
}

export function recentAuditLog(limit = 100) {
  return db
    .prepare('SELECT * FROM tool_audit_log ORDER BY id DESC LIMIT ?')
    .all(limit);
}
