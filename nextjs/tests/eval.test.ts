import { describe, expect, it } from "vitest";
import {
  evaluateMatcher,
  evaluateMatcherCase,
  evaluateScout,
  evaluateScoutCase,
  formatEvalReport,
} from "@/lib/eval";
import { MATCHER_CASES, SCOUT_CASES } from "@/evals/cases";
import { sampleInvoice, samplePo } from "@/lib/data";

describe("eval harness: scout", () => {
  it("every golden scout case passes", () => {
    const summary = evaluateScout(SCOUT_CASES);
    expect(summary.casesPassed).toBe(summary.casesTotal);
    expect(summary.assignmentAccuracy).toBe(1);
    expect(summary.topTaskAccuracy).toBe(1);
    expect(summary.emailsTotal).toBe(18 + 10 + 0 + 3 + 1 + 1 + 1);
  });

  it("the known limitation stays visible: non-English order mail is missed", () => {
    const blind = SCOUT_CASES.find((c) => c.name === "non-english-order-missed")!;
    const result = evaluateScoutCase(blind);
    expect(result.passed).toBe(true);
    expect(result.emails[0].actual).toBeNull();
  });

  it("catches a regression: a wrong label fails the case", () => {
    const broken = {
      ...SCOUT_CASES[0],
      expected: { ...SCOUT_CASES[0].expected, e01: "status_chase" },
    };
    const result = evaluateScoutCase(broken);
    expect(result.passed).toBe(false);
    expect(result.errors.join(" ")).toContain("e01");
  });

  it("catches a missing label instead of silently passing", () => {
    const { e01: _dropped, ...rest } = SCOUT_CASES[0].expected;
    const broken = { ...SCOUT_CASES[0], expected: rest };
    const result = evaluateScoutCase(broken);
    expect(result.passed).toBe(false);
    expect(result.errors.join(" ")).toContain("no expected label");
  });
});

describe("eval harness: matcher", () => {
  it("every golden matcher case passes", () => {
    const summary = evaluateMatcher(MATCHER_CASES);
    expect(summary.casesPassed).toBe(summary.casesTotal);
    expect(summary.fieldPrecision).toBe(1);
    expect(summary.fieldRecall).toBe(1);
  });

  it("catches a regression: a wrong expected delta fails the case", () => {
    const broken = {
      ...MATCHER_CASES[0],
      expectedMismatches: [
        { field: "unit_price", sku: "HOOD-NVY-L", delta: 0.75 },
        { field: "freight", sku: null, delta: 199 },
      ],
    };
    const result = evaluateMatcherCase(broken);
    expect(result.passed).toBe(false);
    expect(result.errors.join(" ")).toContain("freight");
  });

  it("catches a missed mismatch: dropping one expected mismatch fails", () => {
    const broken = {
      ...MATCHER_CASES[0],
      expectedMismatches: [
        { field: "unit_price", sku: "HOOD-NVY-L", delta: 0.75 },
      ],
    };
    const result = evaluateMatcherCase(broken);
    expect(result.passed).toBe(false);
    expect(result.errors.join(" ")).toContain("unexpected mismatch");
  });

  it("field precision drops when expectations under-label what the matcher finds", () => {
    const summary = evaluateMatcher([
      {
        name: "under-labeled",
        po: samplePo(),
        invoice: sampleInvoice(),
        expectedStatus: "MATCH",
        expectedMismatches: [],
      },
      MATCHER_CASES[0],
    ]);
    expect(summary.fieldPrecision).toBeLessThan(1);
  });
});

describe("eval report", () => {
  it("formats scores and case lines a reviewer can read", () => {
    const report = formatEvalReport(
      evaluateScout(SCOUT_CASES),
      evaluateMatcher(MATCHER_CASES),
    );
    expect(report).toContain("Scout: 7/7 cases");
    expect(report).toContain("Matcher: 5/5 cases");
    expect(report).toContain("100.0%");
    expect(report).toContain("non-english-order-missed: pass");
    expect(report).toContain("public-example: pass");
  });
});
