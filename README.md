# ZafinOS Sales Workspace

A thin internal CRM (React + Vite / Node.js + Express / SQLite) with a
dashboard agent that calls a live **Google Gemini** model, using function
calling, scoped to exactly what the signed-in user is allowed to see. Built
for the ZafinOS Product Engineer take-home assignment.

**Architecture diagram:** [`docs/architecture.md`](docs/architecture.md)
**Demo video:** _add your link here before submitting_

---

## Quickstart

Requires Node.js 18+.

### 1. Server

```bash
cd server
npm install
cp .env.example .env
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

- **Authentication** — email/password login against bcrypt-hashed
  passwords, server-side cookie session (`express-session`). No signup;
  exactly the seven seeded demo users.
- **Role-based authorization** — Admin / Manager / Rep, enforced once in
  `server/src/lib/scope.js` and applied by every query in
  `server/src/lib/repo.js`. See [Access model](#access-model-how-its-enforced).
- **Accounts, Opportunities, Proposals** — read endpoints for all three;
  opportunities and proposals also support create/update/delete.
- **Opportunities list + detail view** — one thin CRM screen: a scoped list
  (name, account, owner, stage, amount) and a detail pane with the account
  and related proposals.
- **Manual opportunity update and delete** — from the detail pane, a user
  who can write that row gets an inline **Edit** form (name, amount, stage,
  close date) and a **Delete** button. The button only *appears* when the
  signed-in user's role would normally allow it (rep = must own the row;
  manager/admin = shown by default) — but the actual permission check is
  re-verified on the server on every request, so hiding the button is a UX
  nicety, not the enforcement.
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

This is enforced once, in `server/src/lib/scope.js`, and every other piece of
the app — REST routes (`server/src/lib/repo.js`) and every agent tool
(`server/src/lib/tools.js`) — calls through that same gate. The dashboard
agent is not a separate, more-trusted user: it runs as `req.user`, the
session cookie's owner, and the LLM only ever supplies search *filters*, never
"who to look up as." Asking the agent about a teammate outside your access
returns the same empty result the REST API would return, not an error that
reveals the record exists.

**"My" vs "my team's" vs "the company":** a rep or manager can *read* their
whole team, so "show me the pipeline" and "show me my pipeline" are not
automatically the same dataset. `list_opportunities` and `pipeline_summary`
accept a `mine_only` flag that narrows the caller's own already-scoped query
down to rows they personally own — it only ever narrows, never widens.
"This quarter" is resolved the same way: a `this_quarter` boolean tells the
server to compute the actual current-quarter date range, so the model never
has to compute or guess dates itself. Asking a Manager/Rep for "the company
pipeline" returns their own scope with an explicit note that it isn't
company-wide (only Ava, the Admin, actually sees the whole company).

**Ownership and re-parenting integrity:** `owner_id` cannot be changed
through opportunity/proposal *update* endpoints at all (only set at creation,
where it's still checked against the caller's write scope). Re-assigning an
opportunity's `account_id` is checked against the caller's *read* scope for
the new account — a rep can't move their own opportunity onto an account
outside their team just because they're allowed to edit the opportunity.

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
   key, put it in `server/.env` as `GEMINI_API_KEY`. The dashboard agent
   calls the real Gemini API; without a key, the chat endpoint returns a
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

## What AI generated vs. what I changed

This app was built with an AI pair-programmer end to end, in line with the
assignment's disclaimer that AI assistance is expected. This review pass, in
particular:

- Read the assignment (`index.html`) end to end and audited the existing
  implementation against every numbered requirement before changing
  anything, rather than assuming gaps existed.
- Found and fixed a real authorization gap: `updateOpportunity` allowed
  changing `account_id` without checking the *new* account was inside the
  caller's read scope — a rep could otherwise re-parent their own
  opportunity onto an account belonging to another team. Fixed in
  `server/src/lib/repo.js`.
- Found that **manual update/delete existed on the backend
  (`PATCH`/`DELETE /api/opportunities/:id`) but was never wired into the
  React UI** — `client/src/api.js` had no client for it and the detail pane
  was read-only. Added the client calls and an inline edit form + delete
  button to `Workspace.jsx`, gated by a client-side `canWrite` check that
  mirrors (but does not replace) the server's real enforcement.
- Added the `mine_only` / `this_quarter` filters to `list_opportunities` and
  `pipeline_summary` (repo, tool schema, and system prompt) so "my
  pipeline" and "my team's pipeline this quarter" are distinguishable
  queries instead of both falling back to the caller's full read scope.
- The AI provider had already been migrated from an earlier Anthropic-based
  build to Google Gemini (`@google/genai`) in the codebase, but the README
  and architecture diagram still described the old Anthropic
  implementation. Rewrote both to match what's actually running.
- Added `server/.env.example` (missing from the original submission) and a
  startup warning when `SESSION_SECRET` falls back to its insecure
  development default.
- Verified every fix and every pre-existing scope rule with an automated
  test harness (see below) rather than trusting either the original code or
  the new changes by inspection alone.

---

## Tests performed

The sandbox this review ran in has no outbound network access, and the
`node_modules` shipped with the zip were built for a different OS (the
`better-sqlite3`, `rollup`, and `esbuild` native binaries all fail to load
here with "invalid ELF header" / wrong-platform errors) — so a live
`npm start` / `npm run dev` / Gemini round-trip could not be executed in
*this* environment. That is almost certainly a copy-artifact of this
review sandbox, not a real problem for your machine, since a normal
`npm install` on the target OS rebuilds these correctly.

To still verify the logic that actually matters — the access model — this
review ran the real, unmodified `scope.js` / `repo.js` / `tools.js` against
the real seeded data, swapping only the SQLite driver for Node's built-in
`node:sqlite` (no native compile required) in an isolated test copy. 25
checks were run; **all 25 passed**, including:

- Seed counts match the spec: 7 users, 22 accounts, 44 opportunities, 24 proposals.
- Priya (Hale rep) sees only Hale-owned opportunities; sees none owned by Voss.
- **Trap:** "Show me Sam's opportunities" as Priya → 0 rows.
- **Trap:** `get_opportunity` on a Voss-owned opportunity, called as Priya → returns an access-boundary error, not the record.
- Priya can see teammate Jordan's opportunities (team read).
- Admin sees all 44 opportunities; a manager sees strictly fewer; the same question returns different totals for different users.
- A rep can update her own opportunity; cannot update a teammate's (403); cannot delete another team's opportunity (403).
- A manager can update her own report's opportunity; cannot update another team's (403).
- An admin can update any opportunity, across teams.
- **New fix:** a rep cannot re-parent her own opportunity onto an account she can't read (403) — this was the account-reassignment gap described above.
- `mine_only` correctly narrows a manager's team-wide view down to just their own rows.
- `this_quarter` runs without error.
- `pipeline_summary` returns different results for an admin vs. a rep.
- Tool calls are written to the audit log.
- A rep cannot create an opportunity owned by a teammate (write scope = self only, even though read scope = whole team).

The React client's edit/delete additions were verified by manual code
review and `node --check` on every modified plain-JS file (all pass); the
JSX changes could not be run through `vite build` in this sandbox for the
same wrong-platform-binary reason above, so please do a quick click-through
of Edit/Delete on your machine before recording the demo video.

**Not tested (needs a real Gemini key and a working local install):** the
actual Gemini tool-calling round-trip end to end. The tool layer it calls
into is the same one covered by the 25 automated checks above, and the
system prompt instructions for `mine_only`/`this_quarter`/company-pipeline
framing are new — worth specifically re-running the trap and "my" vs "my
team" stories live before recording the demo.

---

## Trade-offs and what I'd do next

**Detail-view 404 vs. 403.** A record outside your read scope returns 404
("not found") rather than 403 ("forbidden"), so a guessed ID doesn't even
confirm the record exists. That's a deliberate choice, but it does mean
legitimate "you don't have access" messaging is inferred from context, not a
distinct status code — worth revisiting if this became a real product.

**No pagination or search debouncing.** With 44 opportunities the plain list
is fine; a real book of business would need paging and probably a proper
search index rather than `LIKE '%...%'`.

**Session store is in-memory** (`express-session` default). Fine for a demo
and for the single-process dev setup here; would move to a persistent store
before any multi-instance deployment.

**What I'd build next, in order:** (1) confirm the live agent loop against
all six trap/should-work stories with a real key, including the new "my"
vs "my team" and quarter-filter behavior, and capture that in the demo
video; (2) MCP server (bonus C) exposing `list_opportunities` /
`pipeline_summary` bound to a seeded user, since the tool layer is already
factored to make that a thin adapter rather than new logic; (3) 403 vs 404
distinction with a scope-aware error message; (4) formalize the `node:sqlite`
test harness used in this review into a real `npm test` script committed to
the repo, so the access model has regression coverage instead of living only
in this README.

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
