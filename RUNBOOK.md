# TradeOpsJournal — Quick Run Reference

## Prerequisites

Copy the env file and fill in your Supabase credentials before running anything:

```bash
cp frontend/.env.example frontend/.env.local
# then edit frontend/.env.local with your values
```

Required values:
| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Settings → API → service_role key |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon public key |

---

## Run locally (on host)

> Requires Node 20+ installed on your machine.

```bash
cd frontend

# Install dependencies (first time or after pulling changes)
npm install

# Start dev server — http://localhost:3000
npm run dev

# Build for production
npm run build

# Start production server (after build)
npm start

# Lint
npm run lint
```

---

## Run on Docker / Colima

> Active Docker context: `colima-devops-colima` (already set as default).
> Available image: `node:20-alpine`

### Start dev server

```bash
docker run -d --name tradeops-frontend \
  -v $(pwd)/frontend:/app \
  -v /app/node_modules \
  -w /app \
  -p 3000:3000 \
  node:20-alpine \
  sh -c "npm install && npm run dev"
```

Watch logs until ready:
```bash
docker logs -f tradeops-frontend
# Ready when you see: ✓ Ready in Xs
```

### Stop / remove the container

```bash
docker rm -f tradeops-frontend
```

### Restart (after code changes that don't hot-reload)

```bash
docker rm -f tradeops-frontend && docker run -d --name tradeops-frontend \
  -v $(pwd)/frontend:/app \
  -v /app/node_modules \
  -w /app \
  -p 3000:3000 \
  node:20-alpine \
  sh -c "npm install && npm run dev"
```

### One-off commands (install, build, lint, typecheck)

```bash
# npm install
docker run --rm \
  -v $(pwd)/frontend:/app \
  -v /app/node_modules \
  -w /app \
  node:20-alpine npm install

# Production build
docker run --rm \
  -v $(pwd)/frontend:/app \
  -v /app/node_modules \
  -w /app \
  node:20-alpine sh -c "npm install && npm run build"

# TypeScript check
docker run --rm \
  -v $(pwd)/frontend:/app \
  -v /app/node_modules \
  -w /app \
  node:20-alpine sh -c "npm install && ./node_modules/.bin/tsc --noEmit"

# Lint
docker run --rm \
  -v $(pwd)/frontend:/app \
  -v /app/node_modules \
  -w /app \
  node:20-alpine sh -c "npm install && npm run lint"
```

### Open a shell inside the container

```bash
docker exec -it tradeops-frontend sh
```

---

## Colima context management

```bash
# Check active context
docker context ls

# Switch to devops-colima (if not active)
docker context use colima-devops-colima

# Start / stop the Colima VM
colima start devops-colima
colima stop devops-colima

# Check Colima VM status
colima status devops-colima
```

---

## Quick health checks

```bash
# Is the server up?
curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"
# → 307 (redirects to /login if unauthenticated) ✓

# Metrics summary API (requires auth cookie — use browser)
# http://localhost:3000/api/v1/metrics/summary?range=30d

# Performance report API
# http://localhost:3000/api/v1/metrics/performance?range=90d

# Filter by setup tag
# http://localhost:3000/api/v1/metrics/performance?range=all&setup=Breakout

# Filter by direction
# http://localhost:3000/api/v1/metrics/performance?range=all&side=LONG
```

---

## Notes

- **Hot reload**: Next.js hot-reloads most changes automatically. Restart the container only if you change `.env.local`, install new packages, or modify `next.config.js`.
- **node_modules**: The `-v /app/node_modules` flag creates an anonymous volume so the container uses its own compiled modules, separate from any locally installed ones.
- **Port conflict**: If port 3000 is already in use, change the host port: `-p 3001:3000` and open `http://localhost:3001`.
