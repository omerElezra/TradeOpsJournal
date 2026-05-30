# Requirements

## Overview

TradeOpsJournal should evolve from an automated IBKR trading journal into a full trading improvement platform. The core goal is to help the trader understand actions, identify repeatable mistakes, answer targeted self-review questions, and improve trading skill over time.

Rigor level: Full, because the future product involves financial data, user behavior analysis, authentication, private records, and AI-generated coaching.

## Background

Today the project imports IBKR execution data and shows a Streamlit dashboard. This is a strong foundation for quantitative review, but it does not yet capture intent, emotions, screenshots, plans, or rules. AI coaching should be added only after the system captures enough context to evaluate why trades happened, not only what happened.

## Functional Requirements

### FR-1: Automated IBKR trade ingestion

The system must import IBKR stock executions from Gmail CSV attachments and store them without duplicates.

Acceptance criteria:

- [ ] A daily scheduled run imports recent IBKR `STK` execution rows.
- [ ] A manual run can backfill a configurable number of days.
- [ ] Re-running ingestion does not duplicate existing executions.
- [ ] Each imported stock execution is queryable by symbol, execution time, and trade date.

### FR-2: Cash and FX transaction ingestion

The system must import IBKR `CASH` executions and represent cash movement in the dashboard.

Acceptance criteria:

- [ ] FX rows such as `USD.ILS` and `ILS.USD` are stored in `cash_transactions`.
- [ ] Re-running ingestion does not duplicate cash transactions.
- [ ] The dashboard displays deposits, withdrawals, net USD, ILS converted, and commissions.

### FR-3: Trading dashboard

The system must provide a dashboard for reviewing trading results.

Acceptance criteria:

- [ ] The user can filter by all time, today, this week, this month, YTD, or custom date range.
- [ ] The dashboard shows gross P&L, commissions, net P&L, win rate, number of closed trades, average P&L, best day, and worst day.
- [ ] The dashboard shows daily P&L, equity curve, and P&L by symbol.
- [ ] The dashboard shows grouped full trades and raw executions.

### FR-4: Manual trade journaling

The future application must let the trader add subjective context to trades.

Acceptance criteria:

- [ ] The user can write a pre-trade plan.
- [ ] The user can write a post-trade review.
- [ ] The user can tag a trade by setup, mistake, emotion, and market condition.
- [ ] The user can mark whether the trade followed the plan.
- [ ] The user can attach screenshots or external references to a trade.

### FR-5: AI trade analysis

The future AI coach must analyze quantitative trade data and qualitative journal data.

Acceptance criteria:

- [ ] The AI can summarize one trade using executions, P&L, journal notes, and tags.
- [ ] The AI can identify likely strengths and weaknesses with evidence.
- [ ] The AI can compare a trade against the user's stated plan.
- [ ] The AI does not present uncertain conclusions as facts.

### FR-6: AI coaching questions

The future AI coach must ask useful questions when information is missing or behavior needs reflection.

Acceptance criteria:

- [ ] The AI asks a targeted question after a trade if context is missing.
- [ ] The AI explains why the question matters.
- [ ] The user's answer is stored and linked to the trade.
- [ ] The AI uses prior answers to improve future coaching.

### FR-7: Improvement recommendations

The future AI coach must produce practical improvement recommendations.

Acceptance criteria:

- [ ] Recommendations are specific and actionable.
- [ ] Each recommendation links to evidence from trades or journal entries.
- [ ] The user can accept, dismiss, or mark recommendations as completed.
- [ ] The system can track repeated issues over time.

### FR-8: Web application

The future product must move from a local/server Streamlit dashboard toward a secure web application.

Acceptance criteria:

- [ ] Users authenticate before accessing private trading data.
- [ ] Privileged database keys are never exposed to the browser.
- [ ] The web app supports dashboard, journal, trade detail, AI coach, and settings pages.
- [ ] The web app can be deployed independently from ingestion jobs.

## Non-Functional Requirements

### NFR-1: Privacy and security

Trading data, credentials, tokens, and AI prompts must be protected.

Acceptance criteria:

- [ ] Gmail tokens and Supabase service-role keys are stored only in server-side secrets.
- [ ] Browser clients use authenticated user-scoped access, not service-role access.
- [ ] AI prompts exclude secrets and unnecessary personal data.
- [ ] The system has a clear data deletion/export path before multi-user use.

### NFR-2: Reliability

Ingestion must be safe to run repeatedly and easy to diagnose.

Acceptance criteria:

- [ ] Ingestion is idempotent.
- [ ] Ingestion logs include files processed, new records, and duplicate records.
- [ ] Failed files do not silently corrupt existing data.
- [ ] Core parsers have automated tests.

### NFR-3: Explainability

AI coaching must be evidence-based and auditable.

Acceptance criteria:

- [ ] AI insight records include source trade IDs, journal entries, or metrics.
- [ ] The UI distinguishes facts, inferred patterns, and questions.
- [ ] The AI avoids financial advice phrasing and focuses on journaling, process, discipline, and risk review.

### NFR-4: Maintainability

The codebase must be structured so ingestion, analytics, UI, and AI can evolve independently.

Acceptance criteria:

- [ ] Parser and analytics logic can be tested without Streamlit.
- [ ] Database access is isolated behind a module or service layer.
- [ ] UI code does not contain all business logic.

## Constraints

- Current data source is IBKR Activity Flex CSV delivered by Gmail.
- Current database is Supabase.
- Current UI is Streamlit.
- The future product should preserve existing ingestion functionality.
- AI coaching must not be treated as guaranteed investment advice.
- The first AI version should focus on self-review and behavioral improvement, not trade signals.

## Scope Boundary

### In Scope Now

- Document current system.
- Define target architecture and plan.
- Identify schema gaps.
- Prepare roadmap for web app and AI coach.

### In Scope Later

- Refactor current code into modules.
- Add tests.
- Add manual journaling.
- Add web application.
- Add AI analysis and coaching workflow.

### Out of Scope

- Automated trade execution.
- Real-time buy/sell signals.
- Brokerage account control.
- Guaranteed profitable trading recommendations.

## Open Questions

- [NEEDS CLARIFICATION: Should the first web app stay in Python/Streamlit, or should it move to a frontend/backend stack such as Next.js + FastAPI?]
- [NEEDS CLARIFICATION: Will this remain a single-user private app or become a multi-user SaaS-style product?]
- [NEEDS CLARIFICATION: Which AI provider should be used first?]
- [NEEDS CLARIFICATION: Should AI analyze only completed trades, or also open trades and pre-trade plans?]
- [NEEDS CLARIFICATION: Should market data be imported for context, and from which source?]

## Glossary

- **Execution**: One broker-reported buy or sell fill.
- **Full trade**: A group of executions that opens and closes a position for a symbol.
- **Journal entry**: User-written context before, during, or after a trade.
- **AI coach**: A reflection and process-improvement assistant, not an automated trading signal provider.
- **Idempotent ingestion**: Running import multiple times produces the same final database state without duplicates.
