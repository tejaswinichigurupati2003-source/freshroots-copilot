import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Checks the live Zoho setup: refreshes the token, then lists the organizations the token can see.
 * With --save-org it writes ZOHO_ORG_ID to .env.local when exactly one organization is found.
 * Needs the ZohoInventory.settings.READ scope on the Self Client.
 * Docs: https://www.zoho.com/inventory/api/v1/introduction/ and https://www.zoho.com/inventory/api/v1/oauth/
 */

const ENV_FILE = ".env.local";

async function main() {
  if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} not found. Run this from the project folder.`);
  process.loadEnvFile(ENV_FILE);
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  const dc = process.env.ZOHO_DC?.trim() || "in";
  const missing = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN"].filter((n) => !process.env[n]);
  if (missing.length > 0) throw new Error(`Missing in .env.local: ${missing.join(", ")}`);

  const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN as string,
      client_id: ZOHO_CLIENT_ID as string,
      client_secret: ZOHO_CLIENT_SECRET as string,
      grant_type: "refresh_token",
    }),
  });
  const token = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`Token refresh failed (${token.error ?? `HTTP ${tokenResponse.status}`}). Check the client id, secret, refresh token and ZOHO_DC (${dc}).`);
  console.log(`Token refresh OK on accounts.zoho.${dc}`);

  const response = await fetch(`https://www.zohoapis.${dc}/inventory/v1/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` } });
  const body = (await response.json()) as { message?: string; organizations?: { organization_id: string; name: string }[] };
  if (!response.ok || !body.organizations) {
    throw new Error(`Could not list organizations (HTTP ${response.status}): ${body.message ?? "no message"}. The Self Client needs the ZohoInventory.settings.READ scope.`);
  }

  for (const org of body.organizations) console.log(`Organization: ${org.name}  id ${org.organization_id}`);
  if (body.organizations.length === 0) {
    throw new Error(`No Zoho Inventory organization found on this account (data centre .${dc}). Open https://inventory.zoho.${dc}, set up an organization, then run this again.`);
  }

  if (process.argv.includes("--save-org")) {
    if (body.organizations.length > 1) throw new Error("More than one organization found. Set ZOHO_ORG_ID in .env.local yourself.");
    const lines = readFileSync(ENV_FILE, "utf8").split("\n");
    const id = body.organizations[0].organization_id;
    const index = lines.findIndex((l) => l.startsWith("ZOHO_ORG_ID="));
    if (index === -1) lines.push(`ZOHO_ORG_ID=${id}`);
    else lines[index] = `ZOHO_ORG_ID=${id}`;
    writeFileSync(ENV_FILE, lines.join("\n"));
    console.log("Saved ZOHO_ORG_ID to .env.local");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
