import type { RulesView } from "@/lib/db/rules-store";
import { ruleChanges } from "@/lib/rules/settings";
import { DEFAULT_RULE_SETTINGS } from "@/lib/rules/engine";
import { RulesForm } from "./rules-form";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";

/** Its own row on the page: the numbers behind every flag, editable for the next run. */
export function RulesPanel({ rules, canEdit }: { rules: RulesView; canEdit: boolean }) {
  const differs = ruleChanges(DEFAULT_RULE_SETTINGS, rules.settings).length;
  return (
    <section id="rules" className="card p-5" aria-label="Rules">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px]">Rules</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-soft">
            The numbers the next run uses to flag stock and size orders. Changes never alter a run already on screen. Each run keeps the rules it used.
          </p>
        </div>
        <p className="text-[13px] text-ink-soft">
          {rules.lastChange ? (
            <>
              Last changed by <span className="font-semibold text-ink">{rules.lastChange.by}</span>, {when(rules.lastChange.at)}: &ldquo;{rules.lastChange.reason}&rdquo;
            </>
          ) : (
            "Using the documented rules."
          )}
          {differs > 0 && <span className="ml-1 font-semibold text-turmeric">{differs} differ from the documented rules.</span>}
        </p>
      </div>
      <RulesForm rules={rules.settings} canEdit={canEdit} />
    </section>
  );
}
