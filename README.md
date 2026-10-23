# Freshroots Demand Planning Copilot

A class-assignment build for Freshroots. It helps Raghav Kulkarni, a senior demand planner, run his reorder forecast twice a week instead of monthly. **The system recommends. Raghav always decides.**

## What it does

1. Twice a week (Mon and Thu 07:00 IST) or on **Run now**, it loads stock, sales, open purchase orders and the festival calendar.
2. A rules engine, plain TypeScript with no AI, applies Raghav's five rules to all 18 SKUs and sets every flag and quantity.
3. Gemini writes a short reason for each flagged SKU and classifies edge cases (new launch, distributor drop, one-off spike). It never sets a flag or a quantity.
4. Raghav approves, edits or rejects each line on a dashboard. Rejecting needs a reason.
5. Approved lines go to Zoho Inventory as **draft** purchase orders, one per distributor. Nothing is sent without an approval.
6. A monitor watches the rejection rate and quarterly loss, with an automatic kill switch.

The rules and the five assumptions (A1 to A5) are in [CLAUDE.md](CLAUDE.md) and [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

## Architecture

The components map PDF was not in the repo, so this follows the architecture block in `CLAUDE.md`.

| Block | Where it lives |
|---|---|
| Trigger | Vercel Cron (`vercel.json`, `30 1 * * 1,4` UTC) calls `GET /api/cron/run`. The **Run now** button calls `POST /api/run`. |
| Input | `src/lib/ingest`: a `DataSource` interface. `CsvSeedSource` reads the seeded Postgres tables and stands in for the SAP export. `SapSource` is an empty stub. |
| Context | `calendar` (festival months), `skus` (perishability, standard quantity), open POs, and the thresholds in `src/lib/rules/engine.ts`. |
| Processing | `src/lib/rules` is the pure rules engine. `src/lib/ingest/freshness.ts` blocks a run when stock data is more than 7 days old or a required table is empty. |
| AI | `src/lib/llm`: facts, prompt, JSON contract, number guard, template fallback, Gemini client. |
| Output | Postgres tables, the dashboard (`/`), the Zoho gateway (`src/lib/zoho`), the monitor (`/monitor`, `src/lib/monitor`), and the audit log (`/audit`). |

Design rules that the code enforces:

- Code decides flags and quantities. The LLM only writes words, and a reason with a number that is not in the facts is replaced by a template.
- No order reaches Zoho without an explicit approval. Rejected lines never go.
- The kill switch blocks scheduled runs, Run now, and the Zoho push.
- Every decision and system action is written to `audit_log`.

## Setup

You need Node 20 or newer and a free [Neon](https://neon.tech) Postgres database.

```bash
npm install
cp .env.example .env.local   # then fill in the values below
```

1. Create the tables. This applies every file in `db/migrations` once, in order, and is safe to run again:

```bash
npm run migrate
```
2. Load the seed data (safe to run twice):

```bash
npm run seed
```

3. Start the app and open http://localhost:3000:

```bash
npm run dev
```

The seed stock is dated 2026-10-19, so keep `RUN_AS_OF=2026-10-19` in `.env.local`. Without it, today's date makes the data look stale and runs are blocked, which is the intended freshness behaviour.

## Environment variables

Secrets live only in `.env.local`, which is never committed.

| Variable | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Neon connection string (with `sslmode=require`). Server-side only. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | LLM explanations | Optional. Calls go through OpenRouter to Google models only (`google/...`, default `google/gemini-3.7-flash`), served by Google Vertex or AI Studio with no fallback to other providers. Without a key every row gets a template explanation. |
| `ZOHO_MODE` | Zoho | `mock` (default) or `live`. |
| `ZOHO_DC`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID`, `ZOHO_MAP_PATH` | Live Zoho only | `ZOHO_DC` defaults to `in`. Also needs `data/zoho_map.csv` (copy `data/zoho_map.example.csv`). |
| `CRON_SECRET` | Cron route | The cron route rejects every request without it. |
| `KILL_SWITCH_PIN` | Resuming | Without it the kill switch cannot be resumed. |
| `LOSS_WARN_LAKH`, `LOSS_STOP_LAKH`, `BASELINE_LOSS_LAKH` | Monitor | Defaults 40, 50, 30.75. |
| `REJECTION_MIN_LINES` | Monitor | Default 20. Lower it (for example 5) only for a demo. |
| `RUN_AS_OF` | Demo | Treats this date as "today" for the freshness check. |

## Tests and checks

```bash
npm test               # all unit tests, including the golden test against data/expected/expected_results.csv
npm run rubric         # rubric cases T1 to T12 with a pass or fail for each
npm run typecheck
npm run seed:dry       # validates the seed CSVs without a database
npm run explain:demo   # the explanation layer on the seed data, no database needed
npm run run:pipeline   # a real run against Postgres, compared with the answer key
```

`npm run rubric` checks T10 and T11 with a scripted stand-in for Gemini, so it proves the explanation path and not the live model. Run `npm run explain:demo` with a key to see real output.

## What is mocked, and what is invented

- **SAP is always simulated** by the seed CSVs. `SapSource` is a stub.
- **Zoho runs in mock mode by default.** Drafts are saved to the `zoho_drafts` table and nothing leaves the machine. Live mode is written against Zoho's documented API and tested against a fake server only. Whether the free Zoho plan allows API access is unconfirmed.
- **Invented data:** `open_pos_seed.csv`, `sku_economics_seed.csv`, `baseline_losses_seed.csv`, `raghav_past_recommendations_seed.csv`, and the three edge-case SKUs (SKU016 to SKU018) in the merged files.
- **Proposed, not from the case:** the 25% loss-reduction target, the 40 and 50 lakh thresholds, and the 15 to 30% healthy rejection range.

## Switching Zoho to live

Mock mode is the default and needs nothing. For live mode:

1. In the [Zoho API Console](https://api-console.zoho.in) (use the data centre of your account), create a **Self Client**. Put its id and secret in `.env.local` as `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET`, and set `ZOHO_DC` (`in` for India).
2. On its **Generate Code** tab, create a code with these scopes: `ZohoInventory.settings.CREATE,ZohoInventory.settings.READ,ZohoInventory.purchaseorders.CREATE,ZohoInventory.purchaseorders.READ,ZohoInventory.contacts.CREATE,ZohoInventory.contacts.READ,ZohoInventory.items.CREATE,ZohoInventory.items.READ`. Then run `npm run zoho:token -- <code>` within 3 minutes. It saves `ZOHO_REFRESH_TOKEN` without printing it.
3. Run `npm run zoho:setup`. It creates the Zoho Inventory organization if the account has none, then one vendor per distributor and one item per SKU (skipping any that exist), saves `ZOHO_ORG_ID`, and writes `data/zoho_map.csv`. It is safe to run again.
4. Run `npm run zoho:check` to confirm the connection.
5. Set `ZOHO_MODE=live`.

Status of this build: steps 1 and 2 were done and the token works, but Zoho refused to create an organization for the (brand new) account, both on the sign-up page and through the API ("Action cannot be completed", code 6063). So steps 3 to 5 are not done and the live path has only been tested against a fake server. Re-running `npm run zoho:setup` later needs no new code.

More detail is in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md). The walkthrough for the demo is [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Known limits

- "Acting as" (Raghav or Deepa) is a cookie, not a login. It is shown on every page and decides what you can do: Raghav runs the forecast, decides lines and sends orders to Zoho; Deepa sees a read-only oversight view and alone can enter quarterly losses and resume the kill switch. The server refuses anything outside the chosen role.
- The Run now button can take up to a minute when Gemini is on, because calls are paced for free-tier limits.
- Only the latest completed run is shown. Lines left undecided in an older run are not pushed.
