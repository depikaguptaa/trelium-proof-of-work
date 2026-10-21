import type { MatchDocument, MatchReportData, Mismatch } from "./types";

// Deterministic PO / Invoice matcher.
//
// No LLM in this path, on purpose. Trelium sells deterministic agents
// for back-office work. Extraction (PDF to document) is upstream.
// Comparison is pure rules: qty, unit price, freight, setup fee.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function mismatch(
  field: string,
  poValue: number,
  invoiceValue: number,
  sku: string | null = null,
): Mismatch {
  const delta = round2(invoiceValue - poValue);
  return {
    field,
    sku,
    po_value: poValue,
    invoice_value: invoiceValue,
    delta,
    severity: Math.abs(delta) >= 100 ? "high" : "medium",
  };
}

// Pure comparison. The id is a placeholder, the store replaces it with
// a persisted EXC id when the report is saved.
export function compare(po: MatchDocument, invoice: MatchDocument): MatchReportData {
  const mismatches: Mismatch[] = [];
  const poItems = new Map(po.line_items.map((li) => [li.sku, li]));
  const invItems = new Map(invoice.line_items.map((li) => [li.sku, li]));
  const skus = [...new Set([...poItems.keys(), ...invItems.keys()])].sort();

  for (const sku of skus) {
    const p = poItems.get(sku);
    const i = invItems.get(sku);
    if (!p) {
      mismatches.push(mismatch("line_item_missing_in_po", 0, 1, sku));
      continue;
    }
    if (!i) {
      mismatches.push(mismatch("line_item_missing_in_invoice", 1, 0, sku));
      continue;
    }
    if (p.qty !== i.qty) {
      mismatches.push(mismatch("qty", p.qty, i.qty, sku));
    }
    if (round2(p.unit_price) !== round2(i.unit_price)) {
      mismatches.push(mismatch("unit_price", p.unit_price, i.unit_price, sku));
    }
  }

  if (round2(po.freight) !== round2(invoice.freight)) {
    mismatches.push(mismatch("freight", po.freight, invoice.freight));
  }
  if (round2(po.setup_fee) !== round2(invoice.setup_fee)) {
    mismatches.push(mismatch("setup_fee", po.setup_fee, invoice.setup_fee));
  }

  return {
    report_id: "EXC-UNSET",
    po_id: po.doc_id,
    invoice_id: invoice.doc_id,
    status: mismatches.length === 0 ? "MATCH" : "EXCEPTION",
    fields_checked: ["qty", "unit_price", "freight", "setup_fee"],
    mismatch_count: mismatches.length,
    mismatches,
    total_delta: round2(
      mismatches
        .filter((m) => m.field === "freight" || m.field === "setup_fee")
        .reduce((sum, m) => sum + m.delta, 0),
    ),
    approval: {
      state: mismatches.length === 0 ? "not_required" : "pending",
      approver: null,
      note: "",
    },
  };
}
