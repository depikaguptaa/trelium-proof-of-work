"""Mock CRM — stands in for HubSpot/Salesforce/a sheet webhook.

Every approval decision is appended here (and would be a single webhook
POST in production). In-memory so tests are hermetic.
"""
CRM_LOG: list[dict] = []


def log_outcome(report_id: str, decision: str, approver: str, note: str,
                status: str, mismatch_count: int) -> dict:
    entry = {
        "system": "mock-crm",
        "event": "po_invoice_approval",
        "report_id": report_id,
        "decision": decision,
        "approver": approver,
        "note": note,
        "match_status": status,
        "mismatch_count": mismatch_count,
    }
    CRM_LOG.append(entry)
    return entry
