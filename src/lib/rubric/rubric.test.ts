import { describe, expect, it } from "vitest";
import { quietSkusStayOk, runRubric } from "./checks";

describe("rubric T1 to T12", () => {
  it("passes every case", async () => {
    const results = await runRubric();
    expect(results).toHaveLength(12);
    expect(results.filter((r) => !r.passed)).toEqual([]);
  });

  it("keeps the seven quiet SKUs OK", async () => {
    expect(await quietSkusStayOk()).toMatchObject({ passed: true });
  });
});
