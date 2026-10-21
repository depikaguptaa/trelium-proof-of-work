import json
from pathlib import Path

from app.matcher import compare
from app.models import Document

DATA = Path(__file__).resolve().parent.parent / "data"


def load(name):
    return Document(**json.loads((DATA / name).read_text()))


def test_trelium_public_example_two_mismatches_freight_delta_200():
    """Trelium's own site example: PO freight $4,000 vs invoice $4,200,
    '2 fields don't match'. The freight delta is verbatim from their
    example; the second mismatching field in this synthetic fixture is
    the hoodie unit price ($24.00 vs $24.75)."""
    report = compare(load("sample_po.json"), load("sample_invoice.json"))
    assert report["status"] == "EXCEPTION"
    assert report["mismatch_count"] == 2
    freight = [m for m in report["mismatches"] if m["field"] == "freight"]
    assert len(freight) == 1
    assert freight[0]["po_value"] == 4000.0
    assert freight[0]["invoice_value"] == 4200.0
    assert freight[0]["delta"] == 200.0
    assert report["total_delta"] == 200.0
    assert report["approval"]["state"] == "pending"


def test_identical_documents_match():
    po = load("sample_po.json")
    report = compare(po, po)
    assert report["status"] == "MATCH"
    assert report["mismatch_count"] == 0
    assert report["approval"]["state"] == "not_required"


def test_qty_and_setup_fee_mismatches_detected():
    po = load("sample_po.json")
    inv = load("sample_invoice.json")
    inv.line_items[0].qty = 450
    inv.setup_fee = 0
    report = compare(po, inv)
    fields = {m["field"] for m in report["mismatches"]}
    assert "qty" in fields and "setup_fee" in fields
