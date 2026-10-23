import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * One-time setup for live Zoho. Trades the short-lived grant code from the Zoho API Console (Self Client tab)
 * for a refresh token, and saves it in .env.local as ZOHO_REFRESH_TOKEN. The token is never printed.
 *
 * Usage: npm run zoho:token -- <grant code>
 * Needs ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_DC in .env.local.
 * Docs: https://www.zoho.com/inventory/api/v1/oauth/
 */

const ENV_FILE = ".env.local";

function setEnvLine(name: string, value: string) {
  const lines = readFileSync(ENV_FILE, "utf8").split("\n");
  const index = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (index === -1) lines.push(`${name}=${value}`);
  else lines[index] = `${name}=${value}`;
  writeFileSync(ENV_FILE, lines.join("\n"));
}

async function main() {
  if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} not found. Run this from the project folder.`);
  process.loadEnvFile(ENV_FILE);

  const code = process.argv[2]?.trim();
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET } = process.env;
  const dc = process.env.ZOHO_DC?.trim() || "in";
  if (!code) throw new Error("Pass the grant code: npm run zoho:token -- <code>");
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) throw new Error("Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET in .env.local first.");

  const response = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: ZOHO_CLIENT_ID, client_secret: ZOHO_CLIENT_SECRET }),
  });
  const body = (await response.json()) as { refresh_token?: string; error?: string };

  if (!body.refresh_token) {
    const hint = body.error === "invalid_code" ? " The code expires after a few minutes and works once. Generate a new one." : "";
    throw new Error(`Zoho did not return a refresh token (${body.error ?? `HTTP ${response.status}`}).${hint}`);
  }
  setEnvLine("ZOHO_REFRESH_TOKEN", body.refresh_token);
  console.log("Saved ZOHO_REFRESH_TOKEN to .env.local. Next: npm run zoho:check");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
