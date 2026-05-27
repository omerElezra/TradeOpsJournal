# Product Plan

## Overview

This plan turns the current IBKR ingestion + Streamlit dashboard into a more complete trading journal and, later, an AI coaching web application. The work is ordered to protect the existing ingestion pipeline while progressively adding structure, tests, journaling, and AI feedback loops.

## Requirement Ledger

| Req ID | Requirement | Verification Method | Assumptions to Validate | Candidate Decisions |
|---|---|---|---|---|
| FR-1 | Automated IBKR trade ingestion | Run local/manual/scheduled ingestion without duplicate `trade_id` values | Gmail CSV format remains stable enough to parse | Parser module boundaries; raw import archive strategy |
| FR-2 | Cash and FX transaction ingestion | Cash rows appear in `cash_transactions` and dashboard metrics match examples | FX direction logic is correct for all account scenarios | Cash schema; currency normalization |
| FR-3 | Trading dashboard | UI displays metrics, charts, grouped trades, and executions by date range | Current grouping model is good enough for first version | Keep Streamlit short term; refactor analytics |
| FR-4 | Manual trade journaling | User can create plan/review/tags and link them to a trade | Trade grouping IDs need persistence | Journal schema; attachment storage |
| FR-5 | AI trade analysis | AI summarizes trades with cited evidence | AI provider and model are not selected yet | LLM provider; prompt/evidence format |
| FR-6 | AI coaching questions | AI asks and stores targeted questions | Question frequency must not annoy user | Question queue design; notification UX |
| FR-7 | Improvement recommendations | User can accept/dismiss/complete recommendations | Recommendation categories need product definition | Insight schema; scoring and trend tracking |
| FR-8 | Web application | Authenticated app separates frontend from privileged backend | Stack decision is open | Streamlit vs full web stack; auth approach |
| NFR-1 | Privacy and security | Secrets never exposed to browser; user-scoped access | Single-user vs multi-user target is open | Supabase RLS; backend API |
| NFR-2 | Reliability | Parser and analytics tests pass; ingestion logs are clear | No current test harness exists | pytest; fixture CSVs |
| NFR-3 | Explainability | AI insights link to source trades and notes | Evidence granularity must be designed | Evidence schema; prompt output contract |
| NFR-4 | Maintainability | Business logic testable outside UI | Current app is one large Streamlit file | Python package structure |

## Technical Decisions

### TD-1: Stabilize the current Python foundation before adding AI

Decision: Keep the current Python ingestion and dashboard working while extracting reusable modules and tests.

Alternatives:

- Build a new web app immediately and migrate all logic at once.
- Keep the current structure and add AI directly into Streamlit.

Rationale:

- The current ingestion works as the foundation.
- AI quality depends on clean data and reliable analytics.
- Refactoring first reduces future rewrite risk.

Trade-offs:

- Slower path to visible AI features.
- More early work on tests and architecture.

### TD-2: Add manual journal data before AI coaching

Decision: Implement manual plans, reviews, tags, and screenshots before generating serious AI coaching.

Alternatives:

- Generate AI feedback from execution data only.
- Ask AI to infer intent without user notes.

Rationale:

- Execution data explains what happened, not why.
- Coaching should compare actions against intent and rules.

Trade-offs:

- Requires UI and schema work before AI can provide deeper value.

### TD-3: Treat AI as a reflective coach, not a signal engine

Decision: AI should focus on process, discipline, journaling quality, pattern detection, and review questions.

Alternatives:

- Build real-time trading recommendations.
- Ask AI for buy/sell signals.

Rationale:

- Safer and more aligned with the user goal: improve trading skill.
- Avoids overpromising predictive trading performance.

Trade-offs:

- AI will not be positioned as an automated strategy generator in the first phase.

## Milestones

### M1: Documentation and schema alignment

Goal: The project has accurate documentation and Supabase schema guidance.

Requirements: FR-1, FR-2, NFR-1, NFR-2

Dependencies: None

Exit criteria:

- Documentation describes current functionality, architecture, schema, requirements, plan, and AI vision.
- Schema documentation includes both `trades` and `cash_transactions`.
- Known mismatches between docs and code are visible.

### M2: Reliability foundation

Goal: Core ingestion and analytics are testable and safer to change.

Requirements: FR-1, FR-2, FR-3, NFR-2, NFR-4

Dependencies: M1

Exit criteria:

- Parser, transformer, cash handling, and trade grouping functions have tests.
- Business logic is separated from Streamlit UI.
- Local commands for testing are documented.

### M3: Journal data model and UI

Goal: The user can record the why behind each trade.

Requirements: FR-4, NFR-1, NFR-4

Dependencies: M2

Exit criteria:

- User can add plan, review, tags, and notes to a trade.
- Journal data is linked to grouped trades or executions.
- The app can display quantitative and qualitative trade context together.

### M4: AI coaching prototype

Goal: AI can summarize trades, ask useful questions, and produce evidence-based feedback.

Requirements: FR-5, FR-6, FR-7, NFR-3

Dependencies: M3

Exit criteria:

- AI summaries cite source executions and journal entries.
- AI asks targeted follow-up questions.
- User answers are stored and reused in later analysis.
- Recommendations are actionable and trackable.

### M5: Secure web application

Goal: The system becomes a proper authenticated application with a secure backend boundary.

Requirements: FR-8, NFR-1, NFR-4

Dependencies: M2; can run partly in parallel with M3 after stack selection

Exit criteria:

- Authenticated user access exists.
- Privileged keys are server-only.
- Dashboard, journal, trade details, and AI coach pages exist.
- Ingestion jobs remain independent from the web app runtime.

## Tasks

| ID | Title | Milestone | Depends On | Effort | Acceptance |
|---|---|---|---|---|---|
| T001 | Create project documentation set | M1 | — | S | Docs folder contains status, architecture, data model, requirements, plan, and AI vision. |
| T002 | Update quick-start schema guidance | M1 | T001 | S | README or linked docs show schema including `exec_time` and `cash_transactions`. |
| T003 | Create test fixture strategy | M2 | T001 | S | A small sanitized IBKR-style CSV fixture approach is documented or implemented. |
| T004 | Extract ingestion parser module | M2 | T003 | M | CSV parsing and transform functions can run without executing Gmail or Supabase code. |
| T005 | Add parser and transform tests | M2 | T004 | M | Tests cover stock rows, cash rows, timestamp parsing, and ID fallback. |
| T006 | Extract trade analytics module | M2 | T001 | M | Trade grouping and metric calculations can run without Streamlit. |
| T007 | Add analytics tests | M2 | T006 | M | Tests cover open trade, closed trade, partial entries/exits, P&L summaries, and hold duration formatting. |
| T008 | Define persistent trade grouping model | M3 | T006 | M | There is a durable ID or mapping for linking journal entries to grouped trades. |
| T009 | Add journal schema migration | M3 | T008 | M | Tables for journal entries, trade reviews, and tags exist in Supabase. |
| T010 | Add journal UI | M3 | T009 | L | User can create and view trade plans, reviews, and tags from the app. |
| T011 | Add attachment storage design | M3 | T009 | M | Screenshots or file references can be attached to trades with access control. |
| T012 | Select AI provider and prompt contract | M4 | T010 | M | Decision document defines provider, model, privacy rules, input format, and output JSON shape. |
| T013 | Build trade summary prompt | M4 | T012 | M | AI returns summary with facts, inferred observations, questions, and evidence references. |
| T014 | Build coaching question queue | M4 | T013 | M | AI-generated questions are stored, displayed, answered, and linked to trades. |
| T015 | Build recommendation tracking | M4 | T013 | M | User can accept, dismiss, or complete AI recommendations. |
| T016 | Decide web app stack | M5 | T001 | S | Decision captures whether to keep Streamlit or move to a full frontend/backend stack. |
| T017 | Design secure auth and data-access model | M5 | T016 | M | Browser access does not require service-role keys and supports user-scoped data. |
| T018 | Build web app MVP shell | M5 | T017 | L | Authenticated pages exist for dashboard, trades, journal, AI coach, and settings. |

## Execution Waves

- Wave 1: T001
- Wave 2: T002, T003, T006, T016
- Wave 3: T004, T007, T017
- Wave 4: T005, T008, T018
- Wave 5: T009
- Wave 6: T010, T011
- Wave 7: T012
- Wave 8: T013
- Wave 9: T014, T015

## Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| IBKR CSV format changes | High | Medium | Keep raw fixtures, parser tests, and clear error logs. |
| AI gives generic or misleading feedback | High | Medium | Require evidence references and label uncertainty. |
| Service-role key exposed in future browser app | High | Medium | Add backend boundary, auth, and Supabase RLS before web launch. |
| Trade grouping does not match real strategies | Medium | Medium | Add persistent grouping and manual override capability. |
| User does not enter enough journal context | Medium | High | Use short structured prompts and AI follow-up questions. |

## Traceability

| Requirement | Tasks |
|---|---|
| FR-1 | T002, T003, T004, T005 |
| FR-2 | T002, T003, T004, T005 |
| FR-3 | T006, T007, T018 |
| FR-4 | T008, T009, T010, T011 |
| FR-5 | T012, T013 |
| FR-6 | T014 |
| FR-7 | T015 |
| FR-8 | T016, T017, T018 |
| NFR-1 | T017, T018 |
| NFR-2 | T003, T004, T005, T007 |
| NFR-3 | T012, T013, T014, T015 |
| NFR-4 | T004, T006, T016, T018 |

## Next Best Step

After these docs are reviewed, the best next engineering task is to align the Supabase schema and add tests around `scripts/ingest.py` and `app/streamlit_app.py` before adding AI features.
