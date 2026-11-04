import { DEFAULT_RULE_SETTINGS, type RuleSettings } from "../rules/engine";
import { ruleChanges, ruleSettingsSchema } from "../rules/settings";
import type { Db } from "./client";
import { insertRows } from "./sql";

export interface RulesView {
  settings: RuleSettings;
  /** Who last changed the rules, and why. Null while the documented defaults are in use. */
  lastChange: { by: string; reason: string; at: string } | null;
}

/** The rules the next run will use. A missing or unreadable row means the documented defaults. */
export async function loadRules(db: Db): Promise<RulesView> {
  const [row] = await db.query<{ settings: unknown; reason: string; updated_by: string; updated_at: string }>("select settings, reason, updated_by, updated_at from rule_settings where id = 1");
  const parsed = row ? ruleSettingsSchema.safeParse(row.settings) : null;
  if (!row || !parsed?.success) return { settings: DEFAULT_RULE_SETTINGS, lastChange: null };
  return { settings: parsed.data, lastChange: { by: row.updated_by, reason: row.reason, at: row.updated_at } };
}

/** Saves the rules for the next run and writes who changed what to the audit log. */
export async function saveRules(db: Db, input: { settings: RuleSettings; actor: string; reason: string; action: "rules_changed" | "rules_reset" }): Promise<{ changed: number }> {
  const before = (await loadRules(db)).settings;
  const changes = ruleChanges(before, input.settings);
  await insertRows(db, "rule_settings", [{ id: 1, settings: input.settings, reason: input.reason, updated_by: input.actor, updated_at: new Date().toISOString() }], "id");
  await insertRows(db, "audit_log", [{ actor: input.actor, action: input.action, entity: "rules", entity_id: null, details: { reason: input.reason, changes } }]);
  return { changed: changes.length };
}
