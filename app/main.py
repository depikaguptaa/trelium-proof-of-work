"""Paul-lite + PO/Invoice Matcher — FastAPI prototype for Trelium.

Runs with zero API keys: scout = keyword clustering, matcher = deterministic
rules, CRM = in-memory stub. See README.md.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException

from . import crm, matcher, scout
from .models import ApprovalRequest, Document, EmailMessage, MatchRequest, ScoutRequest

app = FastAPI(title="Paul-lite + PO/Invoice Matcher", version="0.1.0")
DATA = Path(__file__).resolve().parent.parent / "data"


def _load(name: str):
    return json.loads((DATA / name).read_text())


@app.get("/health")
def health():
    return {"status": "ok"}


# --- Automation Scout -------------------------------------------------------

@app.post("/scout/analyze")
def scout_analyze(req: ScoutRequest):
    return scout.analyze(req.emails)


@app.get("/scout/demo")
def scout_demo():
    emails = [EmailMessage(**e) for e in _load("sample_emails.json")]
    return scout.analyze(emails)


# --- PO / Invoice Matcher ---------------------------------------------------

@app.post("/matcher/compare")
def matcher_compare(req: MatchRequest):
    return matcher.compare(req.po, req.invoice)


@app.get("/matcher/demo")
def matcher_demo():
    po = Document(**_load("sample_po.json"))
    invoice = Document(**_load("sample_invoice.json"))
    return matcher.compare(po, invoice)


@app.post("/matcher/approve")
def matcher_approve(req: ApprovalRequest):
    """Human-in-the-loop: only an EXCEPTION report can be decided, once."""
    report = matcher.REPORTS.get(req.report_id)
    if report is None:
        raise HTTPException(404, f"report {req.report_id} not found")
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(422, "decision must be 'approved' or 'rejected'")
    if report["approval"]["state"] != "pending":
        raise HTTPException(409, f"report already {report['approval']['state']}")
    report["approval"] = {"state": req.decision, "approver": req.approver,
                          "note": req.note}
    entry = crm.log_outcome(req.report_id, req.decision, req.approver, req.note,
                            report["status"], report["mismatch_count"])
    return {"report": report, "crm_entry": entry}


@app.get("/crm/log")
def crm_log():
    return {"entries": crm.CRM_LOG}
