import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeedRows, seedTables } from "./seed-files";

const seedDir = path.resolve(__dirname, "../../../data/seed");

describe("seed files", () => {
  it.each(seedTables.map((t) => [t.file, t] as const))("%s validates", (_file, entry) => {
    expect(loadSeedRows(entry, seedDir).length).toBeGreaterThan(0);
  });

  it("maps festival flags to booleans", () => {
    const calendar = seedTables.find((t) => t.table === "calendar")!;
    const oct = loadSeedRows(calendar, seedDir).find((r) => r.year_month === "2026-10");
    expect(oct?.is_festival_month).toBe(true);
  });
});
