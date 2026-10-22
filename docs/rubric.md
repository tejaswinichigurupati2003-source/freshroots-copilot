# Freshroots demand planning: rubric

Run date for all tests: 2026-10-19 (October is a festival month in calendar.csv). All ₹ losses are per quarter, as in Deepa's brief. Targets marked "proposed" are our choices, not from the case.

Data used: your 5 files (merged with 3 invented edge-case SKUs in `merged/`), plus invented `open_pos_seed.csv`, `sku_economics_seed.csv`, `baseline_losses_seed.csv`, `raghav_past_recommendations_seed.csv`. Your distributor file is only used for display in the dashboard; the engine does not need it.

## A. Engine correctness (answer key: expected_results.csv)

The app passes a case if its flag and quantity match the answer key. Code sets these, never the LLM.

| # | Scenario | SKU | Pass condition |
|---|---|---|---|
| T1 | Spike (4-wk over 120% of 12-wk) plus low cover | SKU001 | STOCKOUT_RISK, qty 750 (1.5 x 500) |
| T2 | Festival uplift changes the result | SKU002 | OK (cover 11.5 wks with uplift; it would be 14.3 and OVERSTOCK without) |
| T3 | Open PO prevents a duplicate reorder | SKU003 | OK (820 on hand + 400 in transit = 6.5 wks) |
| T4 | Open PO covers a perishable SKU | SKU004 | OK (180 + 150 = 3.3 wks, inside 3 to 4) |
| T5 | Overstock, non-perishable | SKU006 | OVERSTOCK_RISK, qty 0 (22.2 wks) |
| T6 | Perishable over 4-week maximum | SKU007 | OVERSTOCK_RISK (4.1 wks) |
| T7 | Perishable under 3-week minimum | SKU011 | STOCKOUT_RISK, qty 500 (1.8 wks) |
| T8 | Open PO only partly covers the gap | SKU013 | STOCKOUT_RISK, qty 120 (5.3 wks after the PO) |
| T9 | New launch, 3 weeks of history | SKU016 | INSUFFICIENT_HISTORY, shown as an edge case |
| T10 | Distributor drop (rules miss it) | SKU017 | Rules say OK; LLM flags the decline and likely overstock |
| T11 | One-week spike | SKU018 | Rules say STOCKOUT_RISK, qty 225; LLM flags "one-off spike" before approval |
| T12 | Stale or missing data | all | Run stops with a clear error |

The other seven SKUs (SKU005, 008, 009, 010, 012, 014, 015) should come out OK, which tests that the engine stays quiet when it should.

Score: 1 point per passed case, 12 total. Proposed pass mark: 11 of 12.

## B. Outcome metrics

| Metric | How to measure | Baseline | Proposed target | Action line |
|---|---|---|---|---|
| Total quarterly loss (stockout + overstock) | Lost units x stockout_loss_per_unit plus excess units x overstock_loss_per_unit | ₹30.75 lakh (mean of 4 quarters in `baseline_losses_seed.csv`) | 25% lower: ₹23 lakh or less | Warning above ₹40 lakh; auto-stop above ₹50 lakh and run an RCA |
| Stockout loss | Stockout part of the above | ₹20 lakh | ₹15 lakh or less | Review rules if it rises while overstock falls |
| Overstock loss | Overstock part of the above | ₹10.75 lakh | ₹8 lakh or less | Review perishable windows if it rises |
| Exposure caught per run | Indicative_Exposure_INR in the answer key | ₹24,388 on this 18-SKU sample | Flagged before it becomes a loss | Track it each run as a leading indicator |
| Rejection rate | Rejected lines / lines shown to Raghav | n/a | 15 to 30% (15-20% of his calls are judgment) | Above 50%: early warning, manual review |
| Judgment share of Raghav's past calls | `raghav_past_recommendations_seed.csv`: 3 of 20 are judgment | 15% | Matches his 15-20% | Sanity check on the rules, not an exact replay (we have one inventory snapshot, not history) |
| Edge cases caught | Edge cases flagged by the LLM / 3 in the register | n/a | 3 of 3 | Any miss: tighten the LLM prompt |
| Data freshness | Age of the latest SAP and Zoho data at run time | 3 to 4 weeks | 3 days or less | Older than 7 days: block the run |

The ₹ baseline is company-wide (400 SKUs, 1,200 distributors), while the seed data is an 18-SKU sample. Report loss against the baseline at company level, and use the exposure figure to show the sample working.

## C. Kill criteria

| Type | Trigger | Response |
|---|---|---|
| Early warning (manual) | Rejection rate over 50% across a rolling window | Flag to Deepa, review rules with Raghav, keep running |
| Lagging (automatic) | Quarterly loss over ₹50 lakh | Block the Zoho push and scheduled runs, run an RCA, resume only with Deepa's PIN |
| Data (automatic) | Data older than 7 days or files missing | Block the run, show the error |

## D. Demo checklist (1 point each)

1. Run now produces a recommendations table that matches the answer key.
2. Edge cases (SKU016, 017, 018) shown first, each with an LLM reason.
3. Approve, edit quantity, and reject with a required reason all work.
4. Approved lines appear as Zoho PO drafts (mocked); rejected lines do not.
5. Open POs prevent duplicate reorders (SKU003, SKU004).
6. Rejecting over 50% of lines triggers the early-warning banner.
7. Entering a loss figure over ₹50 lakh trips the kill switch and blocks the push.
8. Resuming needs the PIN.
9. Audit log shows every decision with who and when.
10. Submission lists what is mocked (SAP, Zoho) and what is invented.

## E. Assumptions to confirm with Raghav

A1: the 25% uplift applies to average weekly demand for the cover checks, not to the spike test. A2: open POs count as stock. A3: perishability "High" uses 3 to 4 weeks. A4: priority is STOCKOUT > OVERSTOCK > HIGH_DEMAND, with a spike raising the order to 1.5x. A5: under 12 weeks of history means no automatic flag. The case brief does not settle these, so write them in your submission.
