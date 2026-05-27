# TradeOpsJournal Documentation

This folder captures the current system, the target product direction, and the implementation plan for turning TradeOpsJournal into a full trading journal + AI coaching platform.

## Documents

| Document | Purpose |
|---|---|
| [Project Status](PROJECT_STATUS.md) | Current repository status, implemented functionality, known gaps, and immediate risks. |
| [Architecture](ARCHITECTURE.md) | Current architecture, data flow, components, deployment model, and target future architecture. |
| [Data Model](DATA_MODEL.md) | Supabase tables inferred from the current code, field meanings, indexes, and schema gaps. |
| [Requirements](REQUIREMENTS.md) | Product requirements for the current journal and the future AI trading coach. |
| [Product Plan](PRODUCT_PLAN.md) | Milestones, tasks, sequencing, risks, and traceability from requirements to work. |
| [AI Coaching Vision](AI_COACHING_VISION.md) | Future AI coach behavior, feedback loops, question strategy, and privacy constraints. |

## Current One-Line Summary

TradeOpsJournal currently ingests IBKR CSV reports from Gmail into Supabase and presents a Streamlit trading dashboard with trade grouping, P&L analytics, execution history, and cash/FX transaction tracking.

## Future One-Line Summary

The next product direction is a web application where AI analyzes trading behavior, understands repeated actions, asks reflective questions, and recommends specific improvements to trading discipline and decision quality.
