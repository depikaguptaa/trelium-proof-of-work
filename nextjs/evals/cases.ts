import { parseMailbox } from "@/lib/mbox";
import { sampleEmails, sampleInvoice, sampleMboxText, samplePo } from "@/lib/data";
import type { MatchDocument } from "@/lib/types";
import type { MatcherEvalCase, ScoutEvalCase } from "@/lib/eval";

// The golden set. Every expectation below was verified by a human reading
// the email or document, not copied from a run. If behavior changes, the
// case fails until someone updates the expectation on purpose and says
// why. That is the whole point of the harness.

// Verified 2026-10-27 against the 18-email fixture: 6 order re-entry,
// 5 status chases, 3 invoice mismatches, 2 proof approvals, 2 quotes.
const SAMPLE_EXPORT_EXPECTED: Record<string, string | null> = {
  e01: "order_reentry",
  e02: "order_reentry",
  e03: "order_reentry",
  e04: "order_reentry",
  e05: "order_reentry",
  e06: "order_reentry",
  e07: "status_chase",
  e08: "status_chase",
  e09: "status_chase",
  e10: "status_chase",
  e11: "status_chase",
  e12: "invoice_mismatch",
  e13: "invoice_mismatch",
  e14: "invoice_mismatch",
  e15: "proof_approval",
  e16: "proof_approval",
  e17: "quote_request",
  e18: "quote_request",
};

// Verified 2026-10-27 against the 10-message mailbox fixture. m09 is a
// lunch email: the only message that must stay unclassified.
const MAILBOX_EXPECTED: Record<string, string | null> = {
  "m01@acme.example": "order_reentry",
  "m02@acme.example": "order_reentry",
  "m03@northwind.example": "status_chase",
  "m04@northwind.example": "status_chase",
  "m05@printworks.example": "invoice_mismatch",
  "m06@printworks.example": "invoice_mismatch",
  "m07@acme.example": "proof_approval",
  "m08@acme.example": "quote_request",
  "m09@internal.example": null,
  "m10@acme.example": "order_reentry",
};

export const SCOUT_CASES: ScoutEvalCase[] = [
  {
    name: "sample-export-18",
    emails: sampleEmails(),
    expected: SAMPLE_EXPORT_EXPECTED,
    expectedTop: "order_reentry",
  },
  {
    name: "mailbox-10",
    emails: parseMailbox(sampleMboxText()).emails,
    expected: MAILBOX_EXPECTED,
    expectedTop: "order_reentry",
  },
  {
    name: "empty-inbox",
    emails: [],
    expected: {},
    expectedTop: null,
  },
  {
    name: "all-noise",
    emails: [
      { id: "n1", subject: "Lunch on Thursday?", body: "Want to grab lunch?" },
      { id: "n2", subject: "Office closed Friday", body: "The office is closed." },
      { id: "n3", subject: "Happy birthday", body: "Hope you have a great day." },
    ],
    expected: { n1: null, n2: null, n3: null },
    expectedTop: null,
  },
  {
    // Known limitation, kept visible on purpose: the classifier is
    // English keywords only, so a non-English order email is missed.
    // A production Paul needs language handling. The harness records
    // the miss as expected behavior today, so the day it gets fixed
    // this case must be updated, and the fix is visible in the diff.
    name: "non-english-order-missed",
    emails: [
      {
        id: "h1",
        subject: "Naya order",
        body: "500 tees ka naya order aaya hai, jaldi enter karo.",
      },
    ],
    expected: { h1: null },
    expectedTop: null,
  },
  {
    // Two categories match; the one with more keyword hits wins.
    // "Invoice doesn't match" is two invoice hits against one status hit.
    name: "mixed-signals-count-wins",
    emails: [
      {
        id: "x1",
        subject: "Invoice doesn't match, where is my order?",
        body: "The invoice doesn't match the PO. Where is my order?",
      },
    ],
    expected: { x1: "invoice_mismatch" },
    expectedTop: "invoice_mismatch",
  },
  {
    // Exact tie between two categories: the first category in
    // definition order wins. Documented so nobody "fixes" it by
    // accident and changes ranking silently.
    name: "tie-break-definition-order",
    emails: [
      {
        id: "x2",
        subject: "What is the status of my quote?",
        body: "What is the status of my quote?",
      },
    ],
    expected: { x2: "status_chase" },
    expectedTop: "status_chase",
  },
];

function clone(doc: MatchDocument): MatchDocument {
  return JSON.parse(JSON.stringify(doc)) as MatchDocument;
}

export const MATCHER_CASES: MatcherEvalCase[] = [
  {
    // Trelium's own public example: PO freight 4000 vs invoice 4200,
    // plus the hoodie unit price 24.00 vs 24.75.
    name: "public-example",
    po: samplePo(),
    invoice: sampleInvoice(),
    expectedStatus: "EXCEPTION",
    expectedMismatches: [
      { field: "unit_price", sku: "HOOD-NVY-L", delta: 0.75 },
      { field: "freight", sku: null, delta: 200 },
    ],
  },
  {
    name: "clean-match",
    po: samplePo(),
    invoice: clone(samplePo()),
    expectedStatus: "MATCH",
    expectedMismatches: [],
  },
  {
    // Qty changed on the tee line and the setup fee zeroed, on top of
    // the two mismatches already in the fixture pair.
    name: "qty-and-setup-fee",
    po: samplePo(),
    invoice: (() => {
      const inv = clone(sampleInvoice());
      inv.line_items[0].qty = 450;
      inv.setup_fee = 0;
      return inv;
    })(),
    expectedStatus: "EXCEPTION",
    expectedMismatches: [
      { field: "qty", sku: "TEE-BLK-M", delta: -50 },
      { field: "unit_price", sku: "HOOD-NVY-L", delta: 0.75 },
      { field: "freight", sku: null, delta: 200 },
      { field: "setup_fee", sku: null, delta: -150 },
    ],
  },
  {
    // A line on the PO with no matching invoice line.
    name: "line-missing-in-invoice",
    po: samplePo(),
    invoice: (() => {
      const inv = clone(sampleInvoice());
      inv.line_items = inv.line_items.filter((li) => li.sku !== "HOOD-NVY-L");
      return inv;
    })(),
    expectedStatus: "EXCEPTION",
    expectedMismatches: [
      { field: "line_item_missing_in_invoice", sku: "HOOD-NVY-L", delta: -1 },
      { field: "freight", sku: null, delta: 200 },
    ],
  },
  {
    // A line on the invoice with no matching PO line.
    name: "line-missing-in-po",
    po: samplePo(),
    invoice: (() => {
      const inv = clone(sampleInvoice());
      inv.line_items.push({ sku: "CAP-RED", qty: 100, unit_price: 5 });
      return inv;
    })(),
    expectedStatus: "EXCEPTION",
    expectedMismatches: [
      { field: "line_item_missing_in_po", sku: "CAP-RED", delta: 1 },
      { field: "unit_price", sku: "HOOD-NVY-L", delta: 0.75 },
      { field: "freight", sku: null, delta: 200 },
    ],
  },
];
