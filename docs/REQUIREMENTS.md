# Product Requirements Document (PRD) - TradeOpsJournal

## 1. Overview & Objectives
TradeOpsJournal is an automated trading journal designed for swing traders to track performance, mitigate psychological errors, and leverage AI coaching. The platform eliminates manual entry friction by automatically processing daily execution data from Interactive Brokers (IBKR), consolidating fragmented executions into precise trade lifecycles, and rendering a clean, actionable Streamlit dashboard.

Implementation follow-up tasks are tracked in [NEXT_STEPS.md](NEXT_STEPS.md).

---

## 2. Database Architecture (Dual-Table Structure)
**Priority: High**

To preserve historical execution audits while enabling clean, high-level trade analysis, the database layer (Supabase) must implement a strict relational dual-table layout.

### 2.1 Table: `raw_executions`
* **Objective:** Acts as an immutable landing ledger for transaction items exactly as exported by IBKR.
* **Fields:**
    * `execution_id` (Text, PK, Unique) -> Maps to IBKR `TradeID` / `Execution ID` to enforce idempotency.
    * `ticker` (Text, Not Null) -> Stock Symbol.
    * `action` (Text, Not Null) -> BUY / SELL.
    * `quantity` (Numeric, Not Null) -> Raw share size executed.
    * `price` (Numeric, Not Null) -> Share price at execution.
    * `timestamp` (Timestamp, Not Null) -> Exact transaction date and time down to the second (`MM/DD/YYYY,HH:MM:SS`).
    * `raw_csv_row` (JSONB) -> Complete stringified CSV row for system debugging.

### 2.2 Table: `closed_positions`
* **Objective:** Aggregated analytical rows generated dynamically from the raw executions.
* **Fields:**
    * `id` (UUID, PK) -> Auto-generated unique row ID.
    * `ticker` (Text, Not Null)
    * `direction` (Text, Not Null) -> LONG / SHORT.
    * `total_quantity` (Numeric, Not Null) -> Total consolidated share volume.
    * `entry_date` (Timestamp, Not Null) -> Exact timestamp of the opening execution.
    * `exit_date` (Timestamp, Not Null) -> Exact timestamp of the closing execution.
    * `avg_entry_price` (Numeric, Not Null) -> Volume-Weighted Average Entry Price ($VWAP$).
    * `avg_exit_price` (Numeric, Not Null) -> Volume-Weighted Average Exit Price ($VWAP$).
    * `pnl_dollar` (Numeric, Not Null) -> Net realized dollar profit/loss.
    * `hold_time_hours` (Numeric, Not Null) -> Precise active duration in hours.
    * `r_multiple` (Numeric, Nullable) -> Risk performance metric units.
    * `sector` (Text, Nullable) -> Asset classification.
    * `market_context_spy` (Boolean, Nullable) -> Market regime filter.
    * `technical_setup` (Text, Not Null) -> Category classification string.
    * `psychological_tags` (Text[]) -> Dynamic string array of behavioral flags.
    * `ai_coach_question` (Text, Nullable) -> Pre-compiled dynamic target question text.
    * `user_notes` (Text, Nullable) -> Trader's chat input response text.

---

## 3. Data Pipeline & Aggregation Logic

### 3.1 Strict Timestamp FIFO Engine
**Priority: High**
* **Logic:** The ingestion script parses the chronological stream sorted strictly by the exact timestamp down to the second (`DateTime`).
* **Zero-Out Hard Split Rule:** A trade lifecycle tracks accumulated shares. The exact execution second that net held shares hits `0`, the current lifecycle sequence **terminates instantly** and is compiled as a complete record for `closed_positions`. Any subsequent transaction for that ticker—even if executed one minute later (Re-entry)—is forced into a completely new, isolated position lifecycle.
* **Calculation Formulations:**
    * Volume-Weighted Average Entry Price ($Avg\_Entry\_Price$):
        $$Avg\_Entry\_Price = \frac{\sum (Price_i \times Qty_i)}{\sum Qty_i}$$
    * Volume-Weighted Average Exit Price ($Avg\_Exit\_Price$):
        $$Avg\_Exit\_Price = \frac{\sum (Price_j \times Qty_j)}{\sum Qty_j}$$
    * Realized Return ($PnL_{dollar}$):
        $$\text{Long PnL} = (Avg\_Exit\_Price - Avg\_Entry\_Price) \times Total\_Quantity$$

### 3.2 Context Enrichment Layer
**Priority: Medium**
* **Sector Extraction:** Automated post-closure fetch of stock industry labels via the `yfinance` interface.
* **Market Trend State:** Evaluates if the closing price of $SPY$ was trading higher or lower than its 50-day Exponential Moving Average (50EMA) on the trade's specific `entry_date`.

### 3.3 Commissions & Taxes Tracking
**Priority: Low (Future Implementation)**
* Framework layout placeholder to subtract automated transaction expenses (`IBCommission`) from gross PnL metrics in subsequent phases.

---

## 4. UI/UX Specification (Streamlit Dashboard)

### 4.1 Multi-Ledger Presentation Grid
**Priority: High**
* **Tab A (Raw Ledger):** Renders a flat, searchable tabular spreadsheet using `st.dataframe` showing raw inputs directly out of the `raw_executions` table for manual trade verification.
* **Tab B (Consolidated Ledger):** Presents cleanly calculated chronological trade rows compiled out of the `closed_positions` table. Realized metrics (`pnl_dollar`) are dynamically highlighted (Green for wins / Red for losses).

### 4.2 Interactive Zero-Friction Journaling Component
**Priority: Medium**
Expanding an item inside the consolidated dashboard reveals an optimized dual-column input frame:
* **Manual Setup Fine-Tuning:** A simple **Dropdown Selection List (`st.selectbox`)** displaying the current technical category. Allows the trader to change or correct the setup type instantly via a single click, saving adjustments straight to Supabase.
* **Behavioral Metric Capture (Pill Tags):** A layout matrix of interactive, clickable option switches representing mental states (e.g., `FOMO 😱`, `Chased Entry 🏃‍♂️`, `Perfect Discipline 🎯`, `Early Exit ⏰`). Clicking an option initiates an atomic database update statement to populate the `psychological_tags` array field without causing visual UI jitter.

---

## 5. Context-Aware AI Performance Coach

### 5.1 System Context Injection Array
**Priority: Medium**
Before generating user comment parameters, the backend converts the specific rows of the completed lifecycle into a condensed behavioral context packet for the LLM API:
```json
{
  "ticker": "IREN",
  "direction": "LONG",
  "pnl_dollar": -121.50,
  "hold_time_hours": 12.05,
  "psychological_tags": ["FOMO", "Chased Entry"]
}

```

### 5.2 Interactive Chat Input Framing (`st.chat_input`)

**Priority: Medium**

* The AI engine analyzes performance trends and outputs **exactly one targeted question** addressing potential discipline failures, avoiding typical greeting text fillers.
* The question replaces blank feedback textboxes. The user interfaces with the AI via a clean `st.chat_input` line. Typing a response statement and committing pushes data directly to the `user_notes` field in Supabase.

---

## 6. Technical Setup Classifier Logic

**Priority: Low (Postponed until UI/UX Phase is Finalized)**

* Rule parameters checking historical standard indicators (e.g., `Pullback_20EMA` or `Breakout_20D`) will be designed and implemented once the graphical visual workspace satisfies styling guidelines.
