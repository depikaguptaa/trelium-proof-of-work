"""Deterministic PO / Invoice matcher.

No LLM in this path, on purpose — Trelium sells *deterministic* agents for
back-office work. Extraction (PDF -> Document) is upstream; comparison is
pure rules: qty, unit price, freight, setup fee.
"""
from __future__ import annotations

import itertools

from .models import Document

_ids = itertools.count(1)
REPORTS: dict[str, dict] = {}


def _mismatch(field, po_value, invoice_value, sku=None):
    delta = round(float(invoice_value) - float(po_value), 2)
    return {
        "field": field,
        "sku": sku,
        "po_value": po_value,
        "invoice_value": invoice_value,
        "delta": delta,
        "severity": "high" if abs(delta) >= 100 else "medium",
    }


def compare(po: Document, invoice: Document) -> dict:
    mismatches = []
    po_items = {li.sku: li for li in po.line_items}
    inv_items = {li.sku: li for li in invoice.line_items}

    for sku in sorted(set(po_items) | set(inv_items)):
        if sku not in po_items:
            mismatches.append(_mismatch("line_item_missing_in_po", 0, 1, sku))
            continue
        if sku not in inv_items:
            mismatches.append(_mismatch("line_item_missing_in_invoice", 1, 0, sku))
            continue
        p, i = po_items[sku], inv_items[sku]
        if p.qty != i.qty:
            mismatches.append(_mismatch("qty", p.qty, i.qty, sku))
        if round(p.unit_price, 2) != round(i.unit_price, 2):
            mismatches.append(_mismatch("unit_price", p.unit_price, i.unit_price, sku))

    if round(po.freight, 2) != round(invoice.freight, 2):
        mismatches.append(_mismatch("freight", po.freight, invoice.freight))
    if round(po.setup_fee, 2) != round(invoice.setup_fee, 2):
        mismatches.append(_mismatch("setup_fee", po.setup_fee, invoice.setup_fee))

    report = {
        "report_id": f"EXC-{next(_ids):04d}",
        "po_id": po.doc_id,
        "invoice_id": invoice.doc_id,
        "status": "MATCH" if not mismatches else "EXCEPTION",
        "fields_checked": ["qty", "unit_price", "freight", "setup_fee"],
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
        "total_delta": round(sum(m["delta"] for m in mismatches
                                 if m["field"] in ("freight", "setup_fee")), 2),
        "approval": {"state": "not_required" if not mismatches else "pending",
                     "approver": None, "note": ""},
    }
    REPORTS[report["report_id"]] = report
    return report
