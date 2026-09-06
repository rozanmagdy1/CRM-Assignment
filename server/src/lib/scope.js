import { db } from './db.js';

/**
 * Access model (from the brief):
 *  - A "team" is a manager plus every user whose manager_id is that manager.
 *  - Admin:   read every row, write every row.
 *  - Manager: read own team, write own team.
 *  - Rep:     read own team, write only rows they own.
 *
 * Everything here is derived from the signed-in user on the server.
 * The LLM never supplies "which user" - it only supplies search filters,
 * and those filters are ANDed with the scope below, never OR'd or trusted.
 */

const getUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const teamMembersStmt = db.prepare(
  'SELECT id FROM users WHERE id = ? OR manager_id = ?'
);

export function getUserById(id) {
  return getUserStmt.get(id);
}

/**
 * Returns the manager id that defines this user's team.
 * - manager -> their own id
 * - rep     -> their manager_id
 * - admin   -> null (admin isn't on a sales team; handled separately)
 */
function teamManagerId(user) {
  if (user.role === 'manager') return user.id;
  if (user.role === 'rep') return user.manager_id;
  return null;
}

/**
 * Returns the set of user ids whose rows this user may READ.
 * Returns `null` to mean "no restriction" (admin only).
 */
export function readableUserIds(user) {
  if (user.role === 'admin') return null;
  const managerId = teamManagerId(user);
  if (!managerId) return [user.id];
  const rows = teamMembersStmt.all(managerId, managerId);
  return rows.map((r) => r.id);
}

/**
 * Returns the set of user ids whose rows this user may WRITE (create on
 * behalf of / update / delete).
 * Returns `null` to mean "no restriction" (admin only).
 */
export function writableUserIds(user) {
  if (user.role === 'admin') return null;
  if (user.role === 'manager') {
    const rows = teamMembersStmt.all(user.id, user.id);
    return rows.map((r) => r.id);
  }
  // rep: only their own rows
  return [user.id];
}

export function canReadOwner(user, ownerId) {
  const ids = readableUserIds(user);
  return ids === null || ids.includes(ownerId);
}

export function canWriteOwner(user, ownerId) {
  const ids = writableUserIds(user);
  return ids === null || ids.includes(ownerId);
}

/** Builds a `owner_id IN (...)` SQL fragment + params for the given user's read scope. */
export function readScopeWhere(user, column = 'owner_id') {
  const ids = readableUserIds(user);
  if (ids === null) return { clause: '1=1', params: [] };
  if (ids.length === 0) return { clause: '0=1', params: [] };
  return { clause: `${column} IN (${ids.map(() => '?').join(',')})`, params: ids };
}

export function safeUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}
