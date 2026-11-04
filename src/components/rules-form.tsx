"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import { resetRulesAction, saveRulesAction, type DecisionState } from "@/app/actions";
import { DEFAULT_RULE_SETTINGS, type RuleSettings } from "@/lib/rules/engine";

function Field({ label, name, value, original, unit, step = "any" }: { label: string; name: string; value: number; original: number; unit: string; step?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <span className="flex items-center gap-2">
        <input name={name} type="number" inputMode="decimal" step={step} defaultValue={value} required className="field num w-24" />
        <span className="text-sm text-ink-soft">{unit}</span>
      </span>
      <span className="text-[12px] text-ink-faint">{value === original ? `Documented: ${original}` : `Documented: ${original}, changed`}</span>
    </label>
  );
}

function Group({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-mint p-4">
      <h3 className="font-display text-[16px] font-semibold">{title}</h3>
      <p className="mt-0.5 text-[13px] text-ink-soft">{note}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">{children}</div>
    </div>
  );
}

/** Editable rule numbers. Remounts when the saved rules change so the fields always show what is in use. */
export function RulesForm({ rules, canEdit }: { rules: RuleSettings; canEdit: boolean }) {
  // One state for both buttons, so the message on screen is always about the last thing done.
  const [feedback, act, pending] = useActionState<DecisionState, FormData>((_previous, data) => (data.get("intent") === "reset" ? resetRulesAction() : saveRulesAction({}, data)), {});
  const d = DEFAULT_RULE_SETTINGS;

  // Submitted by hand rather than through the form's action so a validation error keeps what was typed.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => act(data));
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <form onSubmit={submit} key={JSON.stringify(rules)} className="flex flex-col gap-4">
        <fieldset disabled={!canEdit || pending} className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Group title="Weeks of cover" note="Below the minimum is a stockout risk. Above the maximum is overstock.">
              <Field label="Minimum" name="generalMin" value={rules.generalCover.min} original={d.generalCover.min} unit="weeks" />
              <Field label="Maximum" name="generalMax" value={rules.generalCover.max} original={d.generalCover.max} unit="weeks" />
            </Group>
            <Group title="Perishable products" note="Used instead of the general limits when perishability is High.">
              <Field label="Minimum" name="perishableMin" value={rules.highPerishableCover.min} original={d.highPerishableCover.min} unit="weeks" />
              <Field label="Maximum" name="perishableMax" value={rules.highPerishableCover.max} original={d.highPerishableCover.max} unit="weeks" />
            </Group>
            <Group title="Demand spike" note="A spike is the last 4 weeks averaging above this share of the 12-week average.">
              <Field label="Threshold" name="spikePercent" value={Math.round(rules.spikeRatio * 1000) / 10} original={d.spikeRatio * 100} unit="% of average" />
              <Field label="Order multiple" name="spikeOrderMultiple" value={rules.spikeOrderMultiple} original={d.spikeOrderMultiple} unit="× standard order" />
            </Group>
            <Group title="Festival months" note="Average weekly demand is multiplied by this before the cover checks.">
              <Field label="Uplift" name="festivalUplift" value={rules.festivalUplift} original={d.festivalUplift} unit="×" />
            </Group>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex min-w-64 flex-1 flex-col gap-1">
              <span className="eyebrow">Why are you changing them?</span>
              <input name="reason" required minLength={5} maxLength={200} placeholder="For example: Diwali stock is selling faster this year" className="field" />
            </label>
            <button type="submit" className="btn btn-primary">
              {pending ? "Saving…" : "Save rules"}
            </button>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" name="intent" value="reset" formNoValidate disabled={!canEdit || pending} className="btn">
            Restore documented rules
          </button>
          <span className="text-[13px] text-ink-soft">Puts all seven numbers back to the original rules.</span>
        </div>
      </form>

      {feedback.error && (
        <p role="alert" className="rounded-xl bg-tomato-wash px-3 py-2 text-sm font-semibold text-tomato">
          {feedback.error}
        </p>
      )}
      {feedback.message && (
        <p role="status" className="rounded-xl bg-leaf-wash px-3 py-2 text-sm font-semibold text-leaf-deep">
          {feedback.message}
        </p>
      )}
    </div>
  );
}
