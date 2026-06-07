# UI Layout & Routing — TradeOpsJournal Redesign

> Design language: **dark-mode first**, minimalist, high-contrast, dense-but-calm
> financial SaaS. Inspired by modern trading terminals (TradingView, Linear-grade
> polish). Neutral zinc/slate base, single accent (emerald for gains / rose for
> losses), generous whitespace, `tabular-nums` for all figures.

---

## 1. Route Map (Next.js App Router)

```
app/
  layout.tsx                 # Root: <html dark>, fonts, providers (Theme, ReactQuery)
  globals.css                # Tailwind + CSS vars (Shadcn theme tokens)

  (auth)/
    login/page.tsx           # Supabase Auth, centered card, no shell

  (dashboard)/
    layout.tsx               # App shell: Sidebar + Topbar + <main>
    page.tsx                 # /  -> Dashboard Overview (KPIs + table + placeholders)

    trades/
      page.tsx               # /trades -> full-screen advanced TradeTable
      [tradeId]/page.tsx     # /trades/:id -> single round-trip detail + chart

    analytics/
      page.tsx               # /analytics -> equity curve, distributions (future-heavy)

    journal/
      page.tsx               # /journal -> notes, tags, setups per trade

    insights/
      page.tsx               # /insights -> AI coaching panel (mock now)

    settings/
      page.tsx               # /settings -> account, data sources, theme
```

**Route groups:**
- `(auth)` → minimal, no sidebar.
- `(dashboard)` → shared shell via nested `layout.tsx`.

---

## 2. App Shell Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  TOPBAR  (h-14, sticky)                                                │
│  [☰] TradeOps   ◦ range picker   ◦ search   ◦ sync status   ◦ avatar  │
├───────────┬──────────────────────────────────────────────────────────┤
│ SIDEBAR   │  MAIN  (scrollable, max-w-screen-2xl, p-6, gap-6)         │
│ (w-60,    │                                                            │
│  fixed,   │   <page content>                                          │
│  collap-  │                                                            │
│  sible    │                                                            │
│  -> w-16) │                                                            │
│           │                                                            │
│ • Overview│                                                            │
│ • Trades  │                                                            │
│ • Analytics                                                            │
│ • Journal │                                                            │
│ • Insights│                                                            │
│ ───────── │                                                            │
│ • Settings│                                                            │
└───────────┴──────────────────────────────────────────────────────────┘
```

### Shell CSS structure
```html
<div class="min-h-screen bg-background text-foreground">
  <aside class="fixed inset-y-0 left-0 w-60 border-r border-border bg-card">...</aside>
  <div class="pl-60">                          <!-- offset for sidebar -->
    <header class="sticky top-0 z-20 h-14 border-b border-border
                   bg-background/80 backdrop-blur flex items-center px-6 gap-4">...</header>
    <main class="p-6">{children}</main>
  </div>
</div>
```
- Sidebar collapse toggles `w-60 ↔ w-16` and the `pl-60 ↔ pl-16` offset.
- On `< md`, sidebar becomes a Shadcn `Sheet` (off-canvas drawer).

---

## 3. Dashboard Overview Grid (`/`)

The overview is a **12-column CSS grid**, stacking responsively.

```
┌──────────── KPI ROW (4 cards) — grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 ────────────┐
│ [ Win Rate ]   [ Profit Factor ]   [ Net ROI ]   [ Total Trades ]                     │
└───────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── MAIN ROW — grid-cols-1 lg:grid-cols-3 ────────────────────┐
│  ┌─────────────────────────────────────────┐   ┌─────────────────────────────────┐    │
│  │ EQUITY CURVE / CHART          (lg:col-2) │   │ AI INSIGHTS PANEL    (lg:col-1) │    │
│  │ [TradingView Lightweight Charts holder]  │   │ [scrollable insight cards]      │    │
│  │ ~h-[360px] placeholder w/ skeleton       │   │ "Coming soon" empty-state now   │    │
│  └─────────────────────────────────────────┘   └─────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── TRADE HISTORY (full width) ───────────────────────────────┐
│  <TradeTable/>  — TanStack Table: toolbar (filters/search) + table + pagination footer │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### Grid markup
```html
<div class="space-y-6">
  <!-- KPI row -->
  <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    <MetricCard ... /> x4
  </section>

  <!-- Chart + AI -->
  <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2"><EquityCurveCard/></div>
    <div class="lg:col-span-1"><AIInsightPanel/></div>
  </section>

  <!-- Trade history -->
  <section>
    <TradeTable/>
  </section>
</div>
```

---

## 4. Component Spatial Map

| Region | Min height | Behavior |
|---|---|---|
| Topbar | `h-14` | sticky, blur, range-picker drives all queries |
| Sidebar | full | fixed, collapsible, active-route highlight |
| KPI Card | `h-28` | equal height, sparkline bottom-right (future) |
| Chart card | `h-[360px]` | placeholder now → Lightweight Charts later |
| AI panel | match chart row | scrollable list, empty-state now |
| Trade table | auto | sticky header, virtualized rows (future) |

---

## 5. Future-Proofing Placeholders

1. **Chart area** — `<EquityCurveCard/>` renders a bordered card with a fixed
   `h-[360px]` body and a centered `Skeleton`/"Chart loading" state. The TradingView
   Lightweight Charts mount point is a single `<div ref>` so dropping the library in
   later requires **zero layout change**.

2. **Buy/Sell markers** — `/trades/[tradeId]` reserves a full-width chart slot above
   the execution list; markers will be fed from the grouped executions already
   returned by FastAPI.

3. **AI Insights** — `<AIInsightPanel/>` is a self-contained card with its own
   loading/empty/error states. Today it shows a friendly "AI coach analyzing soon"
   empty-state; when `/insights` returns data, cards render automatically.

---

## 6. Theme Tokens (Tailwind / Shadcn CSS vars)

```css
/* globals.css — dark first */
:root[class~="dark"] {
  --background: 240 6% 7%;     /* near-black zinc */
  --card:       240 5% 10%;
  --border:     240 4% 18%;
  --foreground: 0 0% 96%;
  --muted-foreground: 240 4% 60%;
  --primary:    152 60% 45%;   /* emerald accent */
  --positive:   152 60% 45%;   /* gains */
  --negative:   352 70% 55%;   /* losses */
  --radius: 0.75rem;
}
```
- All monetary/percent values use `font-mono tabular-nums`.
- Gains/losses colored via `--positive` / `--negative`, never hardcoded.
