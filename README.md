# ZafinOS Sales Workspace

A thin internal CRM (React + Vite / Node.js + Express / SQLite) with a
dashboard agent that calls a live **Google Gemini** model, using function
calling, scoped to exactly what the signed-in user is allowed to see. Built
for the ZafinOS Product Engineer take-home assignment.

**Architecture diagram:** [`docs/architecture.md`](docs/architecture.md)
**Demo video:** https://drive.google.com/file/d/1ETrPDQ_v7Hpn1VkEPQWFLtEA9ELcfywk/view?usp=sharing 

---

## Quickstart

Requires Node.js 18+.

### 1. Server

```bash
cd server
npm install
cp .env
```

Open `server/.env` and set `GEMINI_API_KEY` (see [Manual steps](#manual-steps-before-you-can-demo-this)
below). Everything else in `.env` has a working default for local use.

```bash
npm start
```

This seeds a fresh `zafinos.db` from `server/src/data/*.json` (a copy of the
assignment's `assignment-data/`) every time it boots, and listens on
`http://localhost:4000`.

### 2. Client

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. Click a demo login to fill the form, or type
one of the credentials below.

---

## Demo logins

| Name | Email | Password | Role | Team |
|---|---|---|---|---|
| Ava Chen | `ava@example.com` | `admin123` | Admin | — (sees everything) |
| Marcus Hale | `marcus@example.com` | `manager123` | Manager | Hale |
| Elena Voss | `elena@example.com` | `manager123` | Manager | Voss |
| Priya Shah | `priya@example.com` | `rep123` | Rep | Hale |
| Jordan Lee | `jordan@example.com` | `rep123` | Rep | Hale |
| Sam Okonkwo | `sam@example.com` | `rep123` | Rep | Voss |
| Riley Cho | `riley@example.com` | `rep123` | Rep | Voss |

These are the exact seven users from the assignment's `assignment-data/users.json` — no signup, no invented users.

---

## Main features

- **Authentication** — email/password login against server-side cookie session (`express-session`). 
   No signup;
  exactly the seven seeded demo users.
- **Role-based authorization** — Admin / Manager / Rep, enforced once in
  `server/src/lib/scope.js` and applied by every query in
  `server/src/lib/repo.js`. See [Access model](#access-model-how-its-enforced).
- **Accounts, Opportunities, Proposals** — read endpoints for all three;
  opportunities and proposals also support create/update/delete.
- **Opportunities list + detail view** — one thin CRM screen: a scoped list
  (name, account, owner, stage, amount) and a detail pane with the account
  and related proposals.
- **Scoped dashboard agent** — a named chat assistant on the opportunities
  page that calls Gemini with function/tool calling, using only the tools
  in `server/src/lib/tools.js`.
- **Gemini function/tool calling** — `@google/genai`, model configurable via
  `GEMINI_MODEL`.
- **Permission enforcement in the agent** — the agent's tools call the exact
  same `repo.js` functions the REST routes call. There is no separate,
  more-trusted code path for the LLM.
- **Audit logging (bonus B)** — every tool call is recorded: user, tool
  name, arguments, and a row-count/result summary. Viewable at `/audit-log`,
  admin-only.
- **Agent writes (bonus A)** — create/update/delete tools for opportunities
  and proposals, gated behind `AGENT_WRITES_ENABLED`.

---

## Access model (how it's enforced)

> Full write-up: [`docs/architecture.md`](docs/architecture.md)

| Role | Read | Update / delete |
|---|---|---|
| **Admin** (Ava) | Every row | Every row |
| **Manager** | Own team (self + direct reports) | Own team |
| **Rep** | Own team (can read teammates' rows) | Only rows they own |

---

## User stories implemented

**Should-work (scoped reads):**
- ✅ "What is my team's open pipeline this quarter?" → `pipeline_summary({ this_quarter: true })`
- ✅ "Show me Jordan's opportunities." (as Priya, teammate read) → `list_opportunities({ owner_name: 'Jordan' })`
- ✅ "Which of my opportunities have a proposal in draft?" → `list_proposals({ status: 'Draft' })` cross-referenced with `mine_only`
- ✅ "Summarize my pipeline by stage." → `pipeline_summary({ group_by: 'stage', mine_only: true })`
- ✅ "What is the largest open opportunity I can see?" → `list_opportunities({ open_only: true })`, agent sorts

**Across entities (joins):**
- ✅ "Show me all opportunities at First National Bank of Austin over $100,000." → `list_opportunities({ account_name, min_amount })`
- ✅ "Which opportunities have a proposal in review?" → `list_proposals({ status: 'In review' })`
- ✅ "Show me open opportunities in Negotiation for my team." → `list_opportunities({ stage: 'Negotiation' })`

**Permission traps (demoed as Priya, a Hale rep, asking about Voss):**
- ✅ "Show me Sam's opportunities." → `list_opportunities({ owner_name: 'Sam' })` returns **0 rows**; agent explains Sam isn't on her team rather than inventing an excuse.
- ✅ "Open OPP-233 and read the proposal." → `get_opportunity` returns "not visible to you," not a 404 stack trace or a guessed answer.
- ✅ "What is the company pipeline?" (as a manager or rep) → agent reports only their own scope and says so explicitly, rather than quietly presenting team data as if it were company-wide.
- ✅ "Mark OPP-201 as Closed Won." (as Priya) → refused if `AGENT_WRITES_ENABLED=false`, with a one-line explanation. With it `true` (bonus A), this succeeds for Priya's own rows and is refused (403, surfaced by the agent) for rows she doesn't own.

All of the above were exercised directly against the scoped repository layer
(`server/src/lib/repo.js`) and tool layer (`server/src/lib/tools.js`) with an
automated test harness during this review — see
[Tests performed](#tests-performed) for exactly what ran and passed.

---

## Bonus work included

- **Bonus A — Agent writes.** `create/update/delete_opportunity` and
  `..._proposal` tools exist and enforce the write gate (manager: own team,
  rep: own rows only, admin: everything). Controlled by
  `AGENT_WRITES_ENABLED` in `server/.env` — `false` by default in
  `.env.example` so a fresh clone starts read-only; the working `.env` used
  during development has it `true` so the write path is demonstrable.
- **Bonus B — Tool audit log.** Every tool call (from any user, whether it
  succeeded or was refused) is written to a `tool_audit_log` SQLite table:
  timestamp, user, tool name, arguments, and a row-count/result summary —
  never full record payloads or secrets. Viewable at `/audit-log` in the UI,
  admin-only (`server/src/routes/audit.js`).
- **Bonus C — MCP server.** Not implemented. Given the time box, priority
  went to closing the two real gaps found during review (manual
  update/delete in the UI, and the account re-parenting scope check) over
  adding a third transport for the same tools. See "What I'd do next."

---

## Manual steps before you can demo this

1. **Get a Gemini API key** — https://aistudio.google.com/apikey → create a
   key, put it in `server/.env` as `GEMINI_API_KEY` also add GEMINI_MODEL=gemini-3.5-flash-lite.
   The dashboard agent calls the real Gemini API; without a key, the chat endpoint returns a
   clear error instead of crashing, but nothing will answer.
2. **Nothing else is manual.** The database is SQLite, created and re-seeded
   automatically on every `npm start` from the JSON files copied into
   `server/src/data/`. There's no separate DB server to install, no
   migrations to run, and no user signup — the seven users are exactly the
   assignment's demo logins.
3. Optional: `AGENT_WRITES_ENABLED=true` in `server/.env` if you want to
   demo bonus A (it's the default in the working `.env`, `false` in
   `.env.example`).

---

## Project layout

```
server/
  src/
    lib/
      db.js        seeds SQLite from data/*.json on boot
      scope.js      <-- the access model (read this first)
      repo.js       scoped queries; REST + agent tools both call this
      tools.js      Gemini tool schemas + executeTool()
      audit.js      bonus B: tool-call logging
      auth.js       session middleware
    routes/          auth, accounts, opportunities, proposals, agent, audit-log
    data/            copy of assignment-data/*.json
client/
  src/
    pages/           Login, Workspace (list+detail+chat+edit/delete), AuditLog
    components/      AgentChat.jsx
    AuthContext.jsx
    api.js
docs/
  architecture.md    diagram + design rationale
```
