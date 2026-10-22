"""
Answer key for the demand planning rules engine.
Writes expected_results.csv: what Raghav's 5 documented rules SHOULD output for every SKU.

Run from this folder:
  python generate_expected_results.py

Uses the files in merged/ (your class data + the 3 edge-case SKUs), open_pos_seed.csv and sku_economics_seed.csv.

Assumptions (confirm with Raghav and state them in your submission):
 A1. Festival months come from calendar.csv (Is_Festival_Month). In a festival month, average weekly
     demand is multiplied by 1.25 before the cover checks. It is NOT applied to the 4-wk vs 12-wk spike
     test, because it would cancel out in the ratio.
 A2. Effective stock = units on hand + open PO units (so we never reorder what is already coming).
 A3. Perishability "High" uses min 3 / max 4 weeks of cover instead of 6 / 14.
 A4. Priority when several rules fire: STOCKOUT_RISK > OVERSTOCK_RISK > HIGH_DEMAND > OK.
     Order qty = standard qty; x1.5 if the 4-wk spike also fired. Overstock = 0 (pause).
 A5. Under 12 weeks of history -> INSUFFICIENT_HISTORY (edge case, Raghav decides).
 A6. Exposure (INR) is indicative: units short of the minimum cover x stockout loss per unit, or
     units above the maximum cover x overstock loss per unit.
"""
import pandas as pd

AS_OF = pd.Timestamp("2026-10-19")
sku = pd.read_csv("merged/sku_merged.csv")
sales = pd.read_csv("merged/weekly_sales_merged.csv")
inv = pd.read_csv("merged/inventory_merged.csv")
cal = pd.read_csv("merged/calendar.csv")
pos = pd.read_csv("open_pos_seed.csv")
econ = pd.read_csv("sku_economics_seed.csv").set_index("SKU_ID")

festival = bool(cal.loc[cal.Year_Month == AS_OF.strftime("%Y-%m"), "Is_Festival_Month"].astype(str).str.upper().eq("TRUE").any())
transit = pos.groupby("SKU_ID")["Qty_Units"].sum().to_dict()
rows = []
for _, s in sku.iterrows():
    sid = s.SKU_ID
    h = sales[sales.SKU_ID == sid].sort_values("Week").Units_Sold.tolist()
    onhand = float(inv.loc[inv.SKU_ID == sid, "Units_On_Hand"].sum())
    stock = onhand + transit.get(sid, 0)
    lo, hi = (3, 4) if s.Perishability == "High" else (6, 14)
    std = s.Standard_Reorder_Qty
    if len(h) < 12:
        rows.append([sid, s.SKU_Name, "INSUFFICIENT_HISTORY", 0, "", "", round(stock), 0, "Edge case: Raghav sizes the order"])
        continue
    h12, h4 = h[-12:], h[-4:]
    avg12, avg4 = sum(h12) / 12, sum(h4) / 4
    demand = avg12 * (1.25 if festival else 1)
    cover = stock / demand
    spike = avg4 > 1.2 * avg12
    flag, qty, expo = "OK", 0, 0
    if cover < lo:
        flag, qty = "STOCKOUT_RISK", std * (1.5 if spike else 1)
        expo = (lo * demand - stock) * econ.loc[sid, "Stockout_Loss_Per_Unit_INR"]
    elif cover > hi:
        flag, qty = "OVERSTOCK_RISK", 0
        expo = (stock - hi * demand) * econ.loc[sid, "Overstock_Loss_Per_Unit_INR"]
    elif spike:
        flag, qty = "HIGH_DEMAND", std * 1.5
    rows.append([sid, s.SKU_Name, flag, int(qty), "Y" if spike else "N", round(cover, 1), round(stock), round(expo),
                 f"limits {lo}-{hi} wks; open PO units {transit.get(sid, 0)}"])
out = pd.DataFrame(rows, columns=["SKU_ID", "SKU_Name", "Expected_Flag", "Expected_Order_Qty", "Spike_4wk_vs_12wk",
                                  "Weeks_Of_Cover", "Effective_Stock", "Indicative_Exposure_INR", "Note"])
out.to_csv("expected_results.csv", index=False)
print(f"As of {AS_OF.date()}  festival month: {festival}\n")
print(out.drop(columns=["SKU_Name"]).to_string(index=False))
print("\nTotal indicative exposure (INR):", int(out.Indicative_Exposure_INR.sum()))
