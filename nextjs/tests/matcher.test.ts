import { describe, expect, it } from "vitest";
import { compare } from "@/lib/matcher";
import { sampleInvoice, samplePo } from "@/lib/data";
import type { MatchDocument } from "@/lib/types";

function clone(doc: MatchDocument): MatchDocument {
  return JSON.parse(JSON.stringify(doc)) as MatchDocument;
}

describe("matcher", () => {
  it("reproduces the Trelium public example: 2 mismatches, freight delta 200", () => {
    // Trelium's own site example: PO freight 4000 vs invoice 4200, and
    // "2 fields don't match". The second mismatch in this fixture is
    // the hoodie unit price, 24.00 vs 24.75.
    const report = compare(samplePo(), sampleInvoice());
    expect(report.status).toBe("EXCEPTION");
    expect(report.mismatch_count).toBe(2);
    const freight = report.mismatches.filter((m) => m.field === "freight");
    expect(freight).toHaveLength(1);
    expect(freight[0].po_value).toBe(4000);
    expect(freight[0].invoice_value).toBe(4200);
    expect(freight[0].delta).toBe(200);
    expect(report.total_delta).toBe(200);
    expect(report.approval.state).toBe("pending");
  });

  it("identical documents match cleanly", () => {
    const po = samplePo();
    const report = compare(po, clone(po));
    expect(report.status).toBe("MATCH");
    expect(report.mismatch_count).toBe(0);
    expect(report.approval.state).toBe("not_required");
  });

  it("detects qty and setup fee mismatches", () => {
    const po = samplePo();
    const inv = clone(sampleInvoice());
    inv.line_items[0].qty = 450;
    inv.setup_fee = 0;
    const report = compare(po, inv);
    const fields = new Set(report.mismatches.map((m) => m.field));
    expect(fields.has("qty")).toBe(true);
    expect(fields.has("setup_fee")).toBe(true);
  });
});
