# Demo script (5 minutes)

## Before you start

- Both migrations are run and `npm run seed` has loaded the data.
- `.env.local` has `RUN_AS_OF=2026-10-19`, `KILL_SWITCH_PIN` set to a PIN you remember, and `ZOHO_MODE=mock`.
- For a short demo, set `REJECTION_MIN_LINES=5` so the early warning can fire with a few decisions. The real default is 20.
- If you re-run the demo, the kill switch must be off and you will see decisions from earlier runs. Start from a fresh Neon branch or database, or run the checks below in a new run.
- Start the app with `npm run dev` and open http://localhost:3000. Set **Acting as** to Raghav (the planner). Raghav runs the forecast, decides each line and sends orders. Deepa has a read-only oversight view and is the only one who can enter losses or resume the kill switch.

## Walkthrough

**1. Run now (0:00)**
Press **Run now**. After a few seconds the table fills with 18 SKUs. Say: "Code applied Raghav's five rules to every SKU. Nothing here came from the AI." The header shows the run time and that stock was counted on 2026-10-19.

**2. Edge cases first (0:30)**
Point at the top three rows: SKU016 (new launch, 3 weeks of history), SKU017 (flagged OK, but sales fell 28% over the last four weeks), SKU018 (stockout risk, but one week sold 240 against about 70 normally). Each has a badge and a plain-English reason. Say: "The rules cannot see these. The AI explains them, and Raghav decides."

**3. Approve (1:15)**
Approve SKU001 (750 units). It shows "Approved: 750 units by Raghav" and its buttons turn grey.

**4. Edit a quantity (1:45)**
On SKU011, press **Edit quantity**, change 500 to 400, press **Save and approve**. The row shows "Approved (quantity changed): 400 units".

**5. Reject with a reason (2:15)**
On SKU018, press **Reject**, leave the reason empty and press **Confirm reject**. A red message asks for a reason of at least 5 characters. Type "One-week spike, not a trend" and confirm. Say: "Raghav caught the spike."

**6. Send to Zoho, mock (2:45)**
Press **Send approved to Zoho**. The message lists draft POs per distributor. SKU018, which was rejected, is not in them. In mock mode they are saved in the `zoho_drafts` table. Open POs have already stopped duplicate reorders for SKU003 and SKU004, which show as OK.

**7. Early warning above 50% rejection (3:15)**
Run again, then reject most of the lines with short reasons (at least 5 characters each) until more than half of the decided lines are rejections. The amber banner appears: "Early warning: ... of recent recommendations were rejected." The system keeps running.

**8. Kill switch above 50 lakh (3:45)**
Set **Acting as** to Deepa. The dashboard becomes her read-only oversight view (waiting lines, Raghav's calls, rejection rate, loss, kill switch). Open **Monitor**. Enter quarter "Oct-Dec 2026", stockout 32 and overstock 20 (52 lakh) and press **Save loss**. The red banner appears. Switch back to Raghav, press **Run now**, and see it refuse. Press **Send approved to Zoho** and see it blocked.

**9. Resume with the PIN (4:15)**
On **Monitor**, enter a wrong PIN: "Wrong PIN." Then the right PIN: the switch turns off. The card shows who resumed it and when. Do this as Deepa, so her name is recorded. As Raghav the form is replaced by a note saying only Deepa can resume.

**10. Audit log (4:45)**
Open **Audit log**. Show the decisions with who and when, the push, the loss entry, the kill switch trip, the failed and successful resume.

## If something goes wrong

- "Stock data is N days old": `RUN_AS_OF` is missing or wrong.
- A red "Could not load" card: check `DATABASE_URL` and that `npm run migrate` has run.
- No AI reasons: `OPENROUTER_API_KEY` is missing, so template reasons are used. The demo still works.
