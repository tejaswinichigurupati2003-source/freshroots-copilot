import type { Actor } from "./decide";

export type Permission = "decide" | "push" | "run" | "enter_loss" | "resume" | "edit_rules";

/**
 * Raghav plans: he runs the forecast, decides each line and sends approved orders to Zoho.
 * Deepa oversees: she enters the quarter's loss and is the only one who can resume the kill switch (with the PIN).
 */
const PERMISSIONS: Record<Actor, readonly Permission[]> = {
  Raghav: ["decide", "push", "run", "edit_rules"],
  Deepa: ["enter_loss", "resume", "edit_rules"],
};

const OWNER: Record<Permission, Actor> = { decide: "Raghav", push: "Raghav", run: "Raghav", enter_loss: "Deepa", resume: "Deepa", edit_rules: "Raghav" };

const ACTION_TEXT: Record<Permission, string> = {
  decide: "approve, edit or reject lines",
  push: "send orders to Zoho",
  run: "start a run",
  enter_loss: "enter quarterly losses",
  resume: "resume the kill switch",
  edit_rules: "change the rules",
};

export function can(actor: Actor, permission: Permission): boolean {
  return PERMISSIONS[actor].includes(permission);
}

/** Plain-English refusal shown when someone tries something that belongs to the other role. */
export function denial(actor: Actor, permission: Permission): string {
  return `Only ${OWNER[permission]} can ${ACTION_TEXT[permission]}. You are acting as ${actor}.`;
}
