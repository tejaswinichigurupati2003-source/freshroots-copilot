import { quietSkusStayOk, runRubric } from "../src/lib/rubric/checks";

const PASS_MARK = 11;

async function main() {
  const results = await runRubric();
  const quiet = await quietSkusStayOk();

  console.log("ID    SKU     RESULT  SCENARIO                              DETAIL");
  for (const r of results) {
    console.log(`${r.id.padEnd(5)} ${r.sku.padEnd(7)} ${(r.passed ? "PASS" : "FAIL").padEnd(7)} ${r.scenario.padEnd(37)} ${r.detail}`);
  }
  console.log(`bonus  7 quiet SKUs  ${quiet.passed ? "PASS" : "FAIL"}  ${quiet.detail}`);

  const score = results.filter((r) => r.passed).length;
  console.log(`\nScore: ${score} of ${results.length} (pass mark ${PASS_MARK}).`);
  console.log("T10 and T11 check the LLM path with a scripted stand-in model, not live Gemini.");
  process.exit(score >= PASS_MARK && quiet.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
