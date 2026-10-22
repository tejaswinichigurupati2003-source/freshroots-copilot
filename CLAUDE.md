# Freshroots Demand Planning Copilot

## Purpose
Help Raghav Kulkarni (Senior Demand Planner) run his reorder forecast twice a week instead of monthly.
The system recommends. Raghav always decides. Class assignment: SAP is simulated by seed CSVs, Zoho runs in mock mode unless ZOHO_MODE=live.

## Architecture (follows docs/ components map)
- Trigger: Vercel Cron (Mon and Thu 07:00 IST = "30 1 * * 1,4" UTC) and a "Run now" button.
- Input: seed CSVs standing in for the SAP export, plus open POs (Zoho read or open_pos_seed.csv).
- Context: rules config (Raghav's 5 rules), calendar.csv festival months, SKU master, guardrails.
- Processing: TypeScript rules engine in src/lib/rules (pure functions, no I/O, no AI). Data prep checks freshness.
- AI: Gemini explains flags and classifies edge cases. It never sets a flag or quantity.
- Output: Postgres tables (Neon), approval dashboard, Zoho PO draft push (after approval only), monitor, kill switch.

## Stack
Next.js (App Router) + TypeScript, Postgres (Neon, via the pg driver), Zod, Vitest, Tailwind. Use current stable versions.

## The 5 rules (source of truth: Raghav's documented logic)
1. HIGH_DEMAND: last 4 weeks average sales > 120% of 12-week average. Order 1.5 x Standard_Reorder_Qty.
2. STOCKOUT_RISK: weeks of cover < 6. Order 1 x standard qty immediately.
3. OVERSTOCK_RISK: weeks of cover > 14. Order 0 (pause next order).
4. Festival months (Is_Festival_Month in calendar.csv): multiply average weekly demand by 1.25 before the cover checks.
5. Perishability "High": use minimum 3 and maximum 4 weeks of cover instead of 6 and 14.

## Assumptions (A1 to A5, confirmed with the team)
A1 Festival uplift applies to average weekly demand for cover checks, not to the 4-week vs 12-week spike test.
A2 Effective stock = Units_On_Hand + open PO units.
A3 Perishable limits replace the general limits.
A4 Priority: STOCKOUT_RISK > OVERSTOCK_RISK > HIGH_DEMAND > OK. A spike raises a stockout order to 1.5 x standard qty.
A5 Fewer than 12 weeks of sales history -> INSUFFICIENT_HISTORY, no automatic flag, shown to Raghav as an edge case.
Weeks of cover = effective stock / (12-week average weekly sales x 1.25 in festival months).

## Hard design constraints
- Code decides flags and quantities. The LLM only writes explanations and classifies edge cases from evidence the code passes in.
- No order reaches Zoho without an explicit Raghav approval.
- The kill switch blocks the Zoho push and scheduled runs whenever it is on.
- Every decision and every system action is written to audit_log.
- Secrets live only in .env.local.

## Golden test
For as-of date 2026-10-19, rules output must equal data/expected/expected_results.csv for all 18 SKUs (flag and quantity).

## Conventions
Small pure functions, Zod validation at every boundary, unit tests next to code, no dead code, plain English UI copy.
After each phase: report files changed, tests run, assumptions made, and open questions. Then stop.
