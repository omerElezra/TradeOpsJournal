# TradeOpsJournal UI Requirements

## Purpose

Define clear UI and calculation requirements for each TradeOpsJournal view.

Each view must have a single responsibility:

- `Overview` shows the current account and portfolio state.
- `Trades` shows trading performance and trade-level analysis.
- `Transactions` shows imported raw data and classification health.
- `Cash` shows deposits, withdrawals, FX movements, sweeps, and cash-related commissions.

The application must avoid duplicated, ambiguous, or misleading metrics across views.

---

# Global Requirements

## Data Normalization

The app must normalize raw CSV rows before using them in UI calculations.

The normalized data layer should classify each row into one of the following logical categories:

- `trade`
- `cash_deposit`
- `cash_withdrawal`
- `cash_sweep`
- `commission`
- `fee`
- `unknown`

Raw CSV values must not be used directly in summary cards unless they are first normalized and classified.

## Metric Calculation Layer

All metrics must be calculated in one shared utility/service layer.

Recommended location examples:

```text
src/lib/metrics.ts
src/utils/metrics.ts
src/services/metrics.ts
```

UI components should only render calculated results and should not duplicate calculation logic.

## Naming Rules

Avoid ambiguous metric names.

Use clear business names:

```text
Net Deposited
Total Deposited USD
Total Deposited ILS
Cash / FX Commission Paid
Trade Commission Paid
Net Trading P&L
Net P&L After Fees
Cash Movements Count
Imported Rows
Unclassified Rows
```

Do not use unclear names such as:

```text
Net Cash
Inflows
Outflows
Total Transactions
```

unless they are explicitly defined in the UI.

---

# View 1: Overview

## Goal

The Overview view must answer:

```text
Where does my account stand right now?
```

It should provide a high-level financial and portfolio snapshot.

## Current Issues

The current Overview metrics are not valuable enough:

- `Total Trades` is useful but not enough.
- `Net ROI` is useful only if the calculation is clear.
- `Profit Factor` belongs in the Trades view.
- `Win Rate` belongs in the Trades view.
- The trades table should not appear in Overview because it already exists in the Trades view.

## Requirements

### Remove from Overview

The Overview view must not display:

```text
Trades table
Profit Factor
Win Rate
Detailed Wins / Losses
Raw Transactions
```

### Add Account Snapshot Cards

Overview must display account-level summary cards:

```text
Total Deposited USD
Total Deposited ILS
Total Withdrawn USD
Total Withdrawn ILS
Net Deposited USD
Net Deposited ILS
Current Account Value
Available Cash
Open Positions Value
```

If `Current Account Value`, `Available Cash`, or `Open Positions Value` cannot be calculated from the available data, the UI should show `N/A` or hide the card until supported.

### Add Performance Snapshot Cards

Overview must display performance-level summary cards:

```text
Realized P&L
Unrealized P&L
Total P&L
Total Commission Paid
Net P&L After Fees
Net ROI
```

### Add Activity Snapshot Cards

Overview may display small activity-level cards:

```text
Total Trades
Open Trades
Closed Trades
Last Trade Date
```

These should be secondary metrics, not the main purpose of the page.

## Calculation Requirements

```ts
Total P&L = Realized P&L + Unrealized P&L

Total Commission Paid = Trade Commission Paid + Cash / FX Commission Paid

Net P&L After Fees = Total P&L - Total Commission Paid

Net ROI = Net P&L After Fees / Net Deposited USD * 100
```

If `Net Deposited USD` is zero, `Net ROI` must not divide by zero. Show `0`, `N/A`, or `Not available`.

---

# View 2: Trades

## Goal

The Trades view must answer:

```text
How are my trades performing?
```

It should focus on trade quality, profitability, win/loss behavior, and commission impact.

## Current State

The Trades view currently includes useful items:

```text
Wins count + percent
Losses count + percent
Total Trades
Total Commission
Trades table
```

The trades table is valuable and must remain in this view.

## Requirements

### Keep in Trades

The Trades view must keep:

```text
Trades table
Total Trades
Wins count + percent
Losses count + percent
Trade Commission Paid
```

### Add Primary Trading Metrics

The Trades view must display:

```text
Total Trades
Open Trades
Closed Trades
Win Rate
Realized P&L
Net Trading P&L After Commission
```

### Add Quality Metrics

The Trades view should display:

```text
Average Win
Average Loss
Best Trade
Worst Trade
Profit Factor
Total Trade Volume
Breakeven Trades
```

## Calculation Requirements

Only closed trades should be used for win/loss quality metrics.

```ts
Closed Trades = trades where status === "closed"
Open Trades = trades where status === "open"

Winning Trades = closed trades where pnl > 0
Losing Trades = closed trades where pnl < 0
Breakeven Trades = closed trades where pnl === 0

Win Rate = Winning Trades Count / Closed Trades Count * 100

Gross Profit = sum pnl of winning trades
Gross Loss = absolute sum pnl of losing trades

Profit Factor = Gross Profit / Gross Loss

Average Win = Gross Profit / Winning Trades Count
Average Loss = Gross Loss / Losing Trades Count

Realized P&L = sum pnl of closed trades
Trade Commission Paid = sum absolute trade commission
Net Trading P&L After Commission = Realized P&L - Trade Commission Paid

Total Trade Volume = sum absolute(entry price * quantity)
```

If `Gross Loss` is zero, `Profit Factor` must not divide by zero. Show `N/A`, `Infinity`, or a clear fallback.

---

# View 3: Transactions

## Goal

The Transactions view must answer:

```text
What raw data was imported and how was it classified?
```

This view is for audit, validation, and debugging of imported data.

It should not be a financial dashboard.

## Requirements

### Keep Raw Data Table

Transactions must display the raw imported rows.

The table should include:

```text
Time
Type
Symbol / Pair
Action
Qty
Rate
Value
Commission
Currency
Classification
Status / Warning
```

### Add Data Health Summary

Transactions may display a small data-health summary:

```text
Imported Rows
Classified Rows
Unclassified Rows
Trade Rows
Cash Rows
Deposit Rows
Sweep Rows
Fee / Commission Rows
Last Import Date
```

### Do Not Display Financial Performance Metrics

Transactions must not display:

```text
Net ROI
Win Rate
Profit Factor
Current Account Value
Net Deposited
Total P&L
```

## Calculation Requirements

```ts
Imported Rows = all imported raw rows
Classified Rows = rows where classification !== "unknown"
Unclassified Rows = rows where classification === "unknown"
Trade Rows = rows classified as trade
Cash Rows = rows classified as cash-related
Deposit Rows = rows where type === "Deposit"
Sweep Rows = rows where type === "Sweep"
Fee / Commission Rows = rows where commission exists and commission !== 0
```

Rows that cannot be classified must be clearly marked as `Needs Review`.

---

# View 4: Cash

## Goal

The Cash view must answer:

```text
How much money did I deposit, withdraw, convert, sweep, and pay in cash-related commissions?
```

This view should focus only on cash movements and FX/cash commissions.

## Current Issues

The current Cash summary is confusing:

- `Total Transactions` is misleading because it counts deposits, sweeps, commissions, and technical rows together.
- `Net Cash` is unclear and should be renamed.
- `Inflows` and `Outflows` are unclear and should not be used unless explicitly defined.
- `Total Deposited USD` is useful.
- `Commission Paid` is useful.
- `Total Deposited ILS` is missing and should be added.

## Cash Transaction Interpretation

Based on the current Cash Transactions table:

```text
Type = Deposit
Symbol / Pair = USD.ILS
Action = BUY
Qty = USD amount
Rate = USD/ILS conversion rate
Commission = cash/FX commission, usually negative
Currency = commission/value currency
```

For deposit rows with `USD.ILS`, calculate:

```text
Deposited USD = Qty
Deposited ILS = Qty * Rate
```

`Sweep` rows should be treated as internal cash/FX movements.

Sweep rows must not be counted as deposits or withdrawals.

## Requirements

### Remove or Rename Existing Cards

Replace:

```text
Total Transactions
Net Cash
Inflows
Outflows
```

with clearer metrics.

### Add Primary Cash Cards

Cash must display:

```text
Total Deposited USD
Total Deposited ILS
Total Withdrawn USD
Total Withdrawn ILS
Net Deposited USD
Net Deposited ILS
Cash / FX Commission Paid
```

### Add Secondary Cash Cards

Cash should display:

```text
Deposit Count
Withdrawal Count
Sweep Count
Average Deposit USD
First Deposit Date
Last Deposit Date
```

Optional:

```text
Total Sweep Amount USD
Total Sweep Amount ILS
Other Cash Fees
Dividend / Interest Income
```

### Replace Raw Cash Table with Normalized Cash Table

The Cash view should not show raw CSV data exactly as-is.

It should show a cleaned cash movement table:

```text
Date
Movement Type
Pair
Action
Amount USD
Amount ILS
Rate
Commission
Currency
Notes
```

Each row should clearly indicate whether it is:

```text
Real Cash Flow
Internal Movement
Cost
Needs Review
```

## Calculation Requirements

### Deposits

```ts
Deposit Rows = rows where type === "Deposit"

Total Deposited USD = sum absolute(qty) for Deposit rows

Total Deposited ILS = sum absolute(qty * rate) for Deposit rows where symbolPair === "USD.ILS"
```

### Withdrawals

```ts
Withdrawal Rows = rows where type === "Withdrawal"

Total Withdrawn USD = sum withdrawal amount in USD
Total Withdrawn ILS = sum withdrawal amount in ILS
```

If there are no withdrawal rows, show `0`.

### Net Deposited

```ts
Net Deposited USD = Total Deposited USD - Total Withdrawn USD
Net Deposited ILS = Total Deposited ILS - Total Withdrawn ILS
```

Do not subtract commissions from `Net Deposited`.

Commissions must be shown separately.

### Cash / FX Commission Paid

Commission values may appear as negative numbers in the source CSV.

The UI must display commission as a positive cost.

```ts
Cash / FX Commission Paid = sum absolute(commission) for cash rows
```

If possible, split commission by currency:

```text
Cash / FX Commission Paid USD
Cash / FX Commission Paid ILS
```

### Sweeps

```ts
Sweep Rows = rows where type === "Sweep"
Sweep Count = count Sweep Rows
```

Sweep rows are internal movements.

They must not increase or decrease:

```text
Total Deposited
Total Withdrawn
Net Deposited
```

### Average Deposit

```ts
Average Deposit USD = Total Deposited USD / Deposit Count
```

If `Deposit Count` is zero, show `0` or `N/A`.

---

# Required Final Behavior

## Overview

Overview must show a clean account-level snapshot and must not contain the trades table.

## Trades

Trades must show trade performance metrics and the trades table.

## Transactions

Transactions must show raw imported data, classification status, and data-health metrics only.

## Cash

Cash must show normalized cash movement metrics and a cleaned cash movement table.

## No Metric Duplication Rule

The same metric should appear only where it provides the most value.

Recommended placement:

```text
Total Trades -> Trades primary, Overview secondary
Win Rate -> Trades only
Profit Factor -> Trades only
Total Deposited -> Cash primary, Overview summary
Net Deposited -> Cash primary, Overview summary
Commission Paid -> Cash/Trades split, Overview total
Raw Rows -> Transactions only
```

---

# Implementation Prompt for Code Model

Implement the UI metrics redesign according to this requirements file.

Focus on:

1. Creating a shared metrics calculation layer.
2. Normalizing raw transaction rows before calculations.
3. Separating cash, trade, and raw transaction responsibilities.
4. Removing misleading summary cards.
5. Adding the required cards per view.
6. Preventing duplicated calculation logic inside UI components.
7. Treating `Sweep` as an internal movement, not as deposit or withdrawal.
8. Displaying commissions as positive costs.
9. Calculating `Total Deposited ILS` from `Qty * Rate` for `USD.ILS` deposit rows.
10. Keeping each view focused on its defined purpose.
