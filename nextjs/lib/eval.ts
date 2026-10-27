import { analyze } from "./scout";
import { compare } from "./matcher";
import type { EmailMessage, MatchDocument } from "./types";

// Evaluation harness.
//
// Trelium's own docs describe testing a workflow as manual: prompt-based
// checks on past work, re-running failed and previously passing cases by
// hand, results tracked on "a simple notes sheet". No accuracy number is
// published for Paul or for the agents. This is the missing piece, built
// the way an eval harness should be built: labeled cases with frozen
// expectations, deterministic scoring, and a regression run that fails
// loudly when behavior changes.
//
// What this measures: THIS implementation (keyword clustering, rule
// comparison), not Trelium's production agents. The harness is the
// contribution, not the scores: the same labeled-set-plus-frozen-
// expectation method is what a production agent needs, whatever engine
// classifies the mail. The cases in evals/cases.ts are the golden set.
// Change a rule, and this suite fails until the expectation is updated
// on purpose, with the change recorded in the case, not silently.

// A scout case: an inbox plus the assignment a human reviewer verified.
// expected maps every email id to its task, or null when the email is
// noise and must stay unclassified. expectedTop is the task Paul should
// surface, or null when no opportunity exists.
export interface ScoutEvalCase {
  name: string;
  emails: EmailMessage[];
  expected: Record<string, string | null>;
  expectedTop: string | null;
}

export interface ScoutEmailResult {
  id: string;
  expected: string | null;
  actual: string | null;
  correct: boolean;
}

export interface ScoutCaseResult {
  name: string;
  passed: boolean;
  emails: ScoutEmailResult[];
  assignmentAccuracy: number;
  expectedTop: string | null;
  actualTop: string | null;
  topCorrect: boolean;
  errors: string[];
}

export interface ScoutEvalSummary {
  cases: ScoutCaseResult[];
  casesPassed: number;
  casesTotal: number;
  emailsTotal: number;
  emailsCorrect: number;
  assignmentAccuracy: number;
  topTaskAccuracy: number;
}

export function evaluateScoutCase(c: ScoutEvalCase): ScoutCaseResult {
  const result = analyze(c.emails);
  const assigned = new Map<string, string>();
  for (const cluster of result.clusters) {
    for (const id of cluster.email_ids) assigned.set(id, cluster.task);
  }
  const errors: string[] = [];
  const emails: ScoutEmailResult[] = [];
  for (const email of c.emails) {
    if (!(email.id in c.expected)) {
      errors.push(`${email.id}: no expected label in case`);
      emails.push({ id: email.id, expected: null, actual: assigned.get(email.id) ?? null, correct: false });
      continue;
    }
    const expected = c.expected[email.id];
    const actual = assigned.get(email.id) ?? null;
    const correct = expected === actual;
    emails.push({ id: email.id, expected, actual, correct });
    if (!correct) {
      errors.push(
        `${email.id}: expected ${expected ?? "unclassified"}, got ${actual ?? "unclassified"}`,
      );
    }
  }
  // Emails in the expectation map that never arrived are a case bug.
  for (const id of Object.keys(c.expected)) {
    if (!c.emails.some((e) => e.id === id)) {
      errors.push(`${id}: expected in case but email not present`);
    }
  }
  const actualTop = result.top_opportunity?.task ?? null;
  const topCorrect = actualTop === c.expectedTop;
  if (!topCorrect) {
    errors.push(
      `top opportunity: expected ${c.expectedTop ?? "none"}, got ${actualTop ?? "none"}`,
    );
  }
  const correct = emails.filter((e) => e.correct).length;
  return {
    name: c.name,
    passed: errors.length === 0,
    emails,
    assignmentAccuracy: emails.length === 0 ? 1 : correct / emails.length,
    expectedTop: c.expectedTop,
    actualTop,
    topCorrect,
    errors,
  };
}

export function evaluateScout(cases: ScoutEvalCase[]): ScoutEvalSummary {
  const results = cases.map(evaluateScoutCase);
  const emailsTotal = results.reduce((n, r) => n + r.emails.length, 0);
  const emailsCorrect = results.reduce(
    (n, r) => n + r.emails.filter((e) => e.correct).length,
    0,
  );
  return {
    cases: results,
    casesPassed: results.filter((r) => r.passed).length,
    casesTotal: results.length,
    emailsTotal,
    emailsCorrect,
    assignmentAccuracy: emailsTotal === 0 ? 1 : emailsCorrect / emailsTotal,
    topTaskAccuracy:
      results.length === 0
        ? 1
        : results.filter((r) => r.topCorrect).length / results.length,
  };
}

// A matcher case: a PO/invoice pair plus the mismatches a human reviewer
// verified. expectedMismatches lists field, sku, and the exact delta.
export interface ExpectedMismatch {
  field: string;
  sku: string | null;
  delta: number;
}

export interface MatcherEvalCase {
  name: string;
  po: MatchDocument;
  invoice: MatchDocument;
  expectedStatus: "MATCH" | "EXCEPTION";
  expectedMismatches: ExpectedMismatch[];
}

export interface MatcherCaseResult {
  name: string;
  passed: boolean;
  expectedStatus: "MATCH" | "EXCEPTION";
  actualStatus: "MATCH" | "EXCEPTION";
  expectedMismatches: ExpectedMismatch[];
  actualMismatches: ExpectedMismatch[];
  errors: string[];
}

export interface MatcherEvalSummary {
  cases: MatcherCaseResult[];
  casesPassed: number;
  casesTotal: number;
  fieldPrecision: number;
  fieldRecall: number;
}

function mismatchKey(m: ExpectedMismatch): string {
  return `${m.field}|${m.sku ?? ""}`;
}

export function evaluateMatcherCase(c: MatcherEvalCase): MatcherCaseResult {
  const report = compare(c.po, c.invoice);
  const actual: ExpectedMismatch[] = report.mismatches.map((m) => ({
    field: m.field,
    sku: m.sku,
    delta: m.delta,
  }));
  const errors: string[] = [];
  if (report.status !== c.expectedStatus) {
    errors.push(
      `status: expected ${c.expectedStatus}, got ${report.status}`,
    );
  }
  const expectedKeys = new Map(c.expectedMismatches.map((m) => [mismatchKey(m), m]));
  const actualKeys = new Map(actual.map((m) => [mismatchKey(m), m]));
  for (const [key, exp] of expectedKeys) {
    const act = actualKeys.get(key);
    if (!act) {
      errors.push(`missing mismatch: ${exp.field} ${exp.sku ?? ""}`.trim());
    } else if (act.delta !== exp.delta) {
      errors.push(
        `${exp.field} ${exp.sku ?? ""}: expected delta ${exp.delta}, got ${act.delta}`.trim(),
      );
    }
  }
  for (const key of actualKeys.keys()) {
    if (!expectedKeys.has(key)) {
      const act = actualKeys.get(key)!;
      errors.push(`unexpected mismatch: ${act.field} ${act.sku ?? ""}`.trim());
    }
  }
  return {
    name: c.name,
    passed: errors.length === 0,
    expectedStatus: c.expectedStatus,
    actualStatus: report.status,
    expectedMismatches: c.expectedMismatches,
    actualMismatches: actual,
    errors,
  };
}

export function evaluateMatcher(cases: MatcherEvalCase[]): MatcherEvalSummary {
  const results = cases.map(evaluateMatcherCase);
  let truePositives = 0;
  let predicted = 0;
  let expected = 0;
  for (const r of results) {
    const expectedKeys = new Set(r.expectedMismatches.map(mismatchKey));
    const actualKeys = new Set(r.actualMismatches.map(mismatchKey));
    for (const key of actualKeys) if (expectedKeys.has(key)) truePositives++;
    predicted += actualKeys.size;
    expected += expectedKeys.size;
  }
  return {
    cases: results,
    casesPassed: results.filter((r) => r.passed).length,
    casesTotal: results.length,
    fieldPrecision: predicted === 0 ? (expected === 0 ? 1 : 0) : truePositives / predicted,
    fieldRecall: expected === 0 ? 1 : truePositives / expected,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// One printable report: per-case lines plus aggregate scores. This is
// what a reviewer reads after a run, and what a regression run diffs.
export function formatEvalReport(
  scout: ScoutEvalSummary,
  matcher: MatcherEvalSummary,
): string {
  const lines: string[] = [
    "# Eval report",
    "",
    `Scout: ${scout.casesPassed}/${scout.casesTotal} cases, ` +
      `${scout.emailsCorrect}/${scout.emailsTotal} emails assigned correctly ` +
      `(${pct(scout.assignmentAccuracy)}), top opportunity ${pct(scout.topTaskAccuracy)}.`,
    `Matcher: ${matcher.casesPassed}/${matcher.casesTotal} cases, ` +
      `field precision ${pct(matcher.fieldPrecision)}, field recall ${pct(matcher.fieldRecall)}.`,
    "",
    "## Scout cases",
  ];
  for (const c of scout.cases) {
    lines.push(
      `- ${c.name}: ${c.passed ? "pass" : "FAIL"} ` +
        `(${c.emails.filter((e) => e.correct).length}/${c.emails.length} emails, ` +
        `top ${c.actualTop ?? "none"})`,
    );
    for (const err of c.errors) lines.push(`  - ${err}`);
  }
  lines.push("", "## Matcher cases");
  for (const c of matcher.cases) {
    lines.push(
      `- ${c.name}: ${c.passed ? "pass" : "FAIL"} ` +
        `(${c.actualStatus}, ${c.actualMismatches.length} mismatches)`,
    );
    for (const err of c.errors) lines.push(`  - ${err}`);
  }
  return lines.join("\n");
}
