import { db } from './db.js';
import { readScopeWhere, canReadOwner, canWriteOwner } from './scope.js';

const OPEN_STAGES = ['Discovery', 'Qualification', 'Proposal', 'Negotiation'];
const CLOSED_STAGES = ['Closed Won', 'Closed Lost'];

function userLabel(u) {
  return u ? `${u.first_name} ${u.last_name}` : null;
}

function withNames(rows) {
  const users = db.prepare('SELECT id, first_name, last_name FROM users').all();
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    ...r,
    owner_name: userLabel(userMap[r.owner_id]),
  }));
}

/* ---------------------------- Accounts ---------------------------- */

export function listAccounts(user, { name } = {}) {
  const { clause, params } = readScopeWhere(user, 'owner_id');
  let sql = `SELECT * FROM accounts WHERE ${clause}`;
  const args = [...params];
  if (name) {
    sql += ' AND name LIKE ?';
    args.push(`%${name}%`);
  }
  sql += ' ORDER BY name';
  return withNames(db.prepare(sql).all(...args));
}

export function getAccount(user, id) {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!row) return null;
  if (!canReadOwner(user, row.owner_id)) return null;
  return withNames([row])[0];
}

/* -------------------------- Opportunities -------------------------- */

export function listOpportunities(user, filters = {}) {
  const { clause, params } = readScopeWhere(user, 'o.owner_id');
  const args = [...params];
  let sql = `
    SELECT o.*, a.name AS account_name
    FROM opportunities o
    JOIN accounts a ON a.id = o.account_id
    WHERE ${clause}
  `;

  if (filters.stage) {
    sql += ' AND o.stage = ?';
    args.push(filters.stage);
  }
  if (filters.open_only) {
    sql += ` AND o.stage IN (${OPEN_STAGES.map(() => '?').join(',')})`;
    args.push(...OPEN_STAGES);
  }
  if (filters.closed_only) {
    sql += ` AND o.stage IN (${CLOSED_STAGES.map(() => '?').join(',')})`;
    args.push(...CLOSED_STAGES);
  }
  if (filters.min_amount != null) {
    sql += ' AND o.amount >= ?';
    args.push(filters.min_amount);
  }
  if (filters.max_amount != null) {
    sql += ' AND o.amount <= ?';
    args.push(filters.max_amount);
  }
  if (filters.account_name) {
    sql += ' AND a.name LIKE ?';
    args.push(`%${filters.account_name}%`);
  }
  if (filters.owner_name) {
    sql += ` AND o.owner_id IN (
      SELECT id FROM users WHERE (first_name || ' ' || last_name) LIKE ?
    )`;
    args.push(`%${filters.owner_name}%`);
  }

  sql += ' ORDER BY o.close_date';
  const rows = db.prepare(sql).all(...args);
  return withNames(rows).map((r) => ({ ...r, account_name: r.account_name }));
}

export function getOpportunity(user, id) {
  const row = db
    .prepare(
      `SELECT o.*, a.name AS account_name FROM opportunities o
       JOIN accounts a ON a.id = o.account_id WHERE o.id = ?`
    )
    .get(id);
  if (!row) return null;
  if (!canReadOwner(user, row.owner_id)) return null;
  return withNames([row])[0];
}

export function createOpportunity(user, { name, account_id, stage, amount, close_date, owner_id }) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
  if (!account) throw new HttpError(400, `No such account: ${account_id}`);

  // Who is this opportunity being created for? Defaults to the caller.
  const targetOwner = owner_id || user.id;
  if (!canWriteOwner(user, targetOwner)) {
    throw new HttpError(403, `Not allowed to create records owned by ${targetOwner}`);
  }
  if (!canReadOwner(user, account.owner_id)) {
    throw new HttpError(403, `Not allowed to use account ${account_id}`);
  }

  const id = nextId('opportunities', 'OPP');
  db.prepare(
    `INSERT INTO opportunities (id, name, account_id, owner_id, stage, amount, close_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, account_id, targetOwner, stage || 'Discovery', amount || 0, close_date || null);
  return getOpportunity(user, id);
}

export function updateOpportunity(user, id, patch) {
  const existing = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, `No such opportunity: ${id}`);
  if (!canWriteOwner(user, existing.owner_id)) {
    throw new HttpError(403, `Not allowed to update ${id}`);
  }
  const fields = ['name', 'account_id', 'stage', 'amount', 'close_date'];
  const next = { ...existing };
  for (const f of fields) if (patch[f] !== undefined) next[f] = patch[f];
  db.prepare(
    `UPDATE opportunities SET name=?, account_id=?, stage=?, amount=?, close_date=? WHERE id=?`
  ).run(next.name, next.account_id, next.stage, next.amount, next.close_date, id);
  return getOpportunity(user, id);
}

export function deleteOpportunity(user, id) {
  const existing = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, `No such opportunity: ${id}`);
  if (!canWriteOwner(user, existing.owner_id)) {
    throw new HttpError(403, `Not allowed to delete ${id}`);
  }
  db.prepare('DELETE FROM proposals WHERE opportunity_id = ?').run(id);
  db.prepare('DELETE FROM opportunities WHERE id = ?').run(id);
  return { id, deleted: true };
}

/* ---------------------------- Proposals ---------------------------- */

export function listProposals(user, filters = {}) {
  const { clause, params } = readScopeWhere(user, 'p.owner_id');
  const args = [...params];
  let sql = `
    SELECT p.*, a.name AS account_name, o.name AS opportunity_name
    FROM proposals p
    JOIN accounts a ON a.id = p.account_id
    JOIN opportunities o ON o.id = p.opportunity_id
    WHERE ${clause}
  `;
  if (filters.status) {
    sql += ' AND p.status = ?';
    args.push(filters.status);
  }
  if (filters.opportunity_id) {
    sql += ' AND p.opportunity_id = ?';
    args.push(filters.opportunity_id);
  }
  if (filters.account_name) {
    sql += ' AND a.name LIKE ?';
    args.push(`%${filters.account_name}%`);
  }
  sql += ' ORDER BY p.submitted_date IS NULL, p.submitted_date DESC';
  return withNames(db.prepare(sql).all(...args));
}

export function getProposal(user, id) {
  const row = db
    .prepare(
      `SELECT p.*, a.name AS account_name, o.name AS opportunity_name
       FROM proposals p
       JOIN accounts a ON a.id = p.account_id
       JOIN opportunities o ON o.id = p.opportunity_id
       WHERE p.id = ?`
    )
    .get(id);
  if (!row) return null;
  if (!canReadOwner(user, row.owner_id)) return null;
  return withNames([row])[0];
}

export function proposalsForOpportunity(user, opportunityId) {
  return listProposals(user, { opportunity_id: opportunityId });
}

export function createProposal(user, { name, opportunity_id, status, amount, submitted_date, owner_id }) {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opportunity_id);
  if (!opp) throw new HttpError(400, `No such opportunity: ${opportunity_id}`);
  const targetOwner = owner_id || user.id;
  if (!canWriteOwner(user, targetOwner)) {
    throw new HttpError(403, `Not allowed to create records owned by ${targetOwner}`);
  }
  if (!canReadOwner(user, opp.owner_id)) {
    throw new HttpError(403, `Not allowed to use opportunity ${opportunity_id}`);
  }
  const id = nextId('proposals', 'PRP');
  db.prepare(
    `INSERT INTO proposals (id, name, opportunity_id, account_id, owner_id, status, amount, submitted_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, opportunity_id, opp.account_id, targetOwner, status || 'Draft', amount || opp.amount, submitted_date || null);
  return getProposal(user, id);
}

export function updateProposal(user, id, patch) {
  const existing = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, `No such proposal: ${id}`);
  if (!canWriteOwner(user, existing.owner_id)) {
    throw new HttpError(403, `Not allowed to update ${id}`);
  }
  const fields = ['name', 'status', 'amount', 'submitted_date'];
  const next = { ...existing };
  for (const f of fields) if (patch[f] !== undefined) next[f] = patch[f];
  db.prepare(`UPDATE proposals SET name=?, status=?, amount=?, submitted_date=? WHERE id=?`).run(
    next.name, next.status, next.amount, next.submitted_date, id
  );
  return getProposal(user, id);
}

export function deleteProposal(user, id) {
  const existing = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, `No such proposal: ${id}`);
  if (!canWriteOwner(user, existing.owner_id)) {
    throw new HttpError(403, `Not allowed to delete ${id}`);
  }
  db.prepare('DELETE FROM proposals WHERE id = ?').run(id);
  return { id, deleted: true };
}

/* ---------------------------- Pipeline ---------------------------- */

export function pipelineSummary(user, { group_by = 'stage' } = {}) {
  const opps = listOpportunities(user, {});
  const groups = {};
  for (const o of opps) {
    const key = group_by === 'owner' ? o.owner_name : o.stage;
    groups[key] = groups[key] || { count: 0, amount: 0 };
    groups[key].count += 1;
    groups[key].amount += o.amount;
  }
  return groups;
}

/* ------------------------------ Utils ------------------------------ */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function nextId(table, prefix) {
  const rows = db.prepare(`SELECT id FROM ${table}`).all();
  let max = 0;
  for (const r of rows) {
    const n = parseInt(String(r.id).split('-')[1], 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}-${max + 1}`;
}
