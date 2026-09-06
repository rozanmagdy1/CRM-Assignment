import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(__dirname, '..', '..', 'zafinos.db');

// Fresh DB every server start. This app is a take-home demo seeded straight
// from the JSON data pack, so there's no migration story to maintain.
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','manager','rep')),
    manager_id TEXT REFERENCES users(id)
  );

  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT,
    region TEXT,
    owner_id TEXT NOT NULL REFERENCES users(id)
  );

  CREATE TABLE opportunities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    stage TEXT NOT NULL,
    amount INTEGER NOT NULL,
    close_date TEXT
  );

  CREATE TABLE proposals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL,
    amount INTEGER NOT NULL,
    submitted_date TEXT
  );

  CREATE TABLE tool_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    args_json TEXT NOT NULL,
    result_count INTEGER,
    result_summary TEXT
  );
`);

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
}

function seed() {
  const { users } = loadJson('users.json');
  const { accounts } = loadJson('accounts.json');
  const { opportunities } = loadJson('opportunities.json');
  const { proposals } = loadJson('proposals.json');

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role, manager_id)
    VALUES (@id, @email, @password_hash, @first_name, @last_name, @role, @manager_id)
  `);
  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, name, industry, region, owner_id)
    VALUES (@id, @name, @industry, @region, @owner_id)
  `);
  const insertOpp = db.prepare(`
    INSERT INTO opportunities (id, name, account_id, owner_id, stage, amount, close_date)
    VALUES (@id, @name, @account_id, @owner_id, @stage, @amount, @close_date)
  `);
  const insertProp = db.prepare(`
    INSERT INTO proposals (id, name, opportunity_id, account_id, owner_id, status, amount, submitted_date)
    VALUES (@id, @name, @opportunity_id, @account_id, @owner_id, @status, @amount, @submitted_date)
  `);

  const txn = db.transaction(() => {
    for (const u of users) {
      insertUser.run({
        ...u,
        password_hash: bcrypt.hashSync(u.password, 10),
        manager_id: u.manager_id ?? null,
      });
    }
    for (const a of accounts) insertAccount.run(a);
    for (const o of opportunities) insertOpp.run(o);
    for (const p of proposals) insertProp.run(p);
  });

  txn();

  console.log(
    `[db] seeded ${users.length} users, ${accounts.length} accounts, ` +
    `${opportunities.length} opportunities, ${proposals.length} proposals`
  );
}

seed();
