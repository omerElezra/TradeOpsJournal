# TradeOpsJournal Next Steps

This file tracks practical follow-up work from the PRD that can be added to the Streamlit app and data pipeline.

## 1. Search and Filter Controls

Status: Done.

Add ticker/search, action/status, and outcome filters to the main ledger views so trades can be inspected quickly without scrolling through every row.

Target areas:
- Full Trades: symbol search, status filter, outcome filter.
- All Executions: symbol search, action filter, P&L filter.
- Transactions: pair search, direction filter, currency filter.

## 2. Consolidated Trade Table

Status: Done.

Add a compact closed/open trade table above the expanders with symbol, status, quantity, average prices, hold time, P&L, P&L percent, and commission.

## 3. Journaling UI

Inside each expanded trade, add setup selection, psychological tag controls, and user notes. Persist these fields once the database schema supports them.

## 4. AI Coach Question

Generate one targeted coaching question per closed trade using the trade context packet described in the PRD. Start with deterministic local rules, then connect an LLM later.

## 5. Context Enrichment

Display sector and SPY 50EMA regime once enrichment is available in Supabase.

## 6. Trade Quality Dashboard

Add charts for P&L by setup, P&L by psychological tag, win rate by setup, hold time by outcome, and recurring mistake tags.