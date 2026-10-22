# Assumptions

The case brief does not settle these. They are written here so they can be confirmed with Raghav.

## Rule assumptions (A1 to A5)

| # | Assumption |
|---|---|
| A1 | The 25% festival uplift applies to average weekly demand for the cover checks, not to the spike test (4-week average against the 12-week average). |
| A2 | Open PO units count as stock. Effective stock is units on hand plus open PO units. |
| A3 | Perishability "High" uses 3 to 4 weeks of cover in place of the general 6 to 14. |
| A4 | Priority is STOCKOUT_RISK, then OVERSTOCK_RISK, then HIGH_DEMAND, then OK. A spike raises a stockout order to 1.5 times the standard quantity. |
| A5 | Under 12 weeks of sales history gives INSUFFICIENT_HISTORY. There is no automatic flag, and the SKU is shown to Raghav as an edge case. |

Weeks of cover is effective stock divided by the 12-week average weekly sales, times 1.25 in festival months.

## Choices made while building

- **Boundaries are strict.** Cover of exactly 6 or exactly 14 weeks is OK. A 4-week average of exactly 120% of the 12-week average is not a spike.
- **Overstock plus a spike** gives OVERSTOCK_RISK and order 0, following the priority in A4. This is not in the golden answer key. Please confirm it with Raghav.
- **Edge-case signals are computed by code:** under 12 weeks of history; the last 4 weeks at least 25% below the 12-week average while the flag is OK; one week above 2.5 times the 12-week median.
- **Drafts are not stock.** In live mode, only open, issued and partially received Zoho POs count as stock on the way.
- **Stock freshness** uses the oldest per-SKU latest stock date. Runs are blocked when it is more than 7 days before the run date.
- **Rejecting saves a final quantity of 0.** Editing to the same quantity is recorded as an approval.
- **The rejection rate** counts decided lines in the last 30 days and is measured only from 20 decided lines. `REJECTION_MIN_LINES` can lower this for demos.

## Invented data files

These are not from Freshroots. They were made up to fit the case brief's ranges.

| File | What it is |
|---|---|
| `open_pos_seed.csv` | 5 open purchase orders (SKU003, 004, 013, 008, 012). |
| `sku_economics_seed.csv` | Unit cost, price, and loss per unit for stockouts and overstock. |
| `baseline_losses_seed.csv` | Four quarters of loss (29, 34, 29, 31 lakh) averaging 30.75 lakh. |
| `raghav_past_recommendations_seed.csv` | 20 past calls, 3 of them judgment (15%). |
| SKU016, SKU017, SKU018 | Three edge-case SKUs added to the merged SKU, sales and stock files, plus `edge_cases_register.csv`. |
| `zoho_map.example.csv` | A template for the Zoho item and vendor ids. Real ids come from your Zoho account. |

The 30.75 lakh baseline is company-wide (400 SKUs, 1,200 distributors). The seed data is an 18-SKU sample, so loss is reported against the baseline at company level.

## Proposed thresholds (ours, not from the case)

| Item | Value |
|---|---|
| Loss reduction target | 25% below baseline, about 23 lakh per quarter |
| Loss warning | Above 40 lakh per quarter |
| Automatic stop (kill switch) | Above 50 lakh per quarter |
| Healthy rejection rate | 15% to 30% |
| Early warning | Rejection rate above 50% |
| Data stale | Stock older than 7 days |

## What is mocked

- SAP is always simulated by the seed CSVs.
- Zoho runs in mock mode unless `ZOHO_MODE=live`. The live code is untested against a real Zoho account.
- Rubric cases T10 and T11 are checked with a scripted stand-in for Gemini.
