import { describe, expect, it } from "vitest";
import { can, denial, type Permission } from "./roles";

const ALL: Permission[] = ["decide", "push", "run", "enter_loss", "resume"];

describe("roles", () => {
  it("lets Raghav plan: run, decide and push", () => {
    expect(ALL.filter((p) => can("Raghav", p))).toEqual(["decide", "push", "run"]);
  });

  it("lets Deepa oversee: enter losses and resume the kill switch", () => {
    expect(ALL.filter((p) => can("Deepa", p))).toEqual(["enter_loss", "resume"]);
  });

  it("gives every permission to exactly one of them", () => {
    for (const p of ALL) expect([can("Raghav", p), can("Deepa", p)].filter(Boolean)).toHaveLength(1);
  });

  it("explains a refusal in plain English", () => {
    expect(denial("Raghav", "resume")).toBe("Only Deepa can resume the kill switch. You are acting as Raghav.");
    expect(denial("Deepa", "push")).toBe("Only Raghav can send orders to Zoho. You are acting as Deepa.");
  });
});
