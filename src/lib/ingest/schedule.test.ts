import { describe, expect, it } from "vitest";
import { formatRun, nextScheduledRun, nextScheduledRuns } from "./schedule";

describe("nextScheduledRun", () => {
  it("is Monday 07:00 IST after a Thursday run", () => {
    // Thursday 22 Oct 2026, 08:00 IST is after that day's 07:00 IST run
    const next = nextScheduledRun(new Date("2026-10-22T02:30:00Z"));
    expect(next.toISOString()).toBe("2026-10-26T01:30:00.000Z");
    expect(formatRun(next)).toMatch(/^Mon 26 Oct, 7:00 am IST$/);
  });

  it("is today when it is still before the run", () => {
    // Monday 26 Oct 2026, 06:00 IST
    expect(nextScheduledRun(new Date("2026-10-26T00:30:00Z")).toISOString()).toBe("2026-10-26T01:30:00.000Z");
  });

  it("is Thursday after a Monday run, and never the same instant", () => {
    expect(nextScheduledRun(new Date("2026-10-26T01:30:00Z")).toISOString()).toBe("2026-10-29T01:30:00.000Z");
  });

  it("skips the weekend", () => {
    expect(nextScheduledRun(new Date("2026-10-30T10:00:00Z")).toISOString()).toBe("2026-11-02T01:30:00.000Z");
  });
});

describe("nextScheduledRuns", () => {
  it("lists the following runs in order, alternating Monday and Thursday", () => {
    const runs = nextScheduledRuns(new Date("2026-10-22T02:30:00Z"), 4).map((d) => d.toISOString().slice(0, 10));
    expect(runs).toEqual(["2026-10-26", "2026-10-29", "2026-11-02", "2026-11-05"]);
  });
});
