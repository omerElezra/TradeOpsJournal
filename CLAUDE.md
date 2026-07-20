# TradeOpsJournal — Claude Instructions

## Environment

**All npm/Node commands must run inside the Colima container, not on the local machine.**

This applies to: `npm install`, `npm run dev`, `npm run build`, `npm list`, `npx`, and any other Node/npm invocation.

Use `docker run` with a volume mount. The active Docker context is `colima-devops-colima` (already set as default).

**One-off commands** (install, build, typecheck):
```bash
docker run --rm \
  -v /Users/oelezra/github/TradeOpsJournal/frontend:/app \
  -v /app/node_modules \
  -w /app \
  node:20 npm <command>
```

**Dev server** (persistent):
```bash
docker run -d --name tradeops-frontend \
  -v /Users/oelezra/github/TradeOpsJournal/frontend:/app \
  -v /app/node_modules \
  -w /app \
  -p 3000:3000 \
  node:20 sh -c "npm install && npm run dev"
```

The `-v /app/node_modules` anonymous volume keeps container node_modules separate from the host.

**Tests** (mount the REPO ROOT, not just frontend/ — the DB contract tests read `scripts/migrations/*.sql`):
```bash
docker run --rm \
  -v /Users/oelezra/github/TradeOpsJournal:/repo \
  -v /repo/frontend/node_modules \
  -w /repo/frontend \
  node:20 sh -c "npm install --silent && npx vitest run"
```

## Database changes

Any change that touches the database — a new migration, a new/renamed column, a
change to a query module in `frontend/lib/queries/`, or to the scoring-rules
seed — MUST run the test suite (command above). `frontend/lib/db-contract.test.ts`
verifies migrations ↔ code stay in sync (columns read/written exist, no
redundant columns, upsert conflict keys have UNIQUE constraints, the
scoring_rules seed matches `DEFAULT_RULES` and passes `validateRule`). When a
migration adds or removes a column, update the matching contract list in that
test in the same change.
