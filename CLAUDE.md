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
