from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_scout_demo_endpoint():
    body = client.get("/scout/demo").json()
    assert body["emails_analyzed"] == 18
    assert body["top_opportunity"]["task"] == "order_reentry"
    assert body["top_opportunity"]["agent_prompt"]


def test_matcher_demo_and_human_approval_logs_to_mock_crm():
    report = client.get("/matcher/demo").json()
    assert report["status"] == "EXCEPTION"
    assert report["mismatch_count"] == 2

    resp = client.post("/matcher/approve", json={
        "report_id": report["report_id"], "decision": "approved",
        "approver": "ops-lead", "note": "freight delta accepted, vendor confirmed",
    })
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["report"]["approval"]["state"] == "approved"
    assert payload["crm_entry"]["system"] == "mock-crm"
    assert payload["crm_entry"]["decision"] == "approved"

    log = client.get("/crm/log").json()["entries"]
    assert any(e["report_id"] == report["report_id"] for e in log)

    # a report can only be decided once
    again = client.post("/matcher/approve", json={
        "report_id": report["report_id"], "decision": "rejected"})
    assert again.status_code == 409


def test_approve_unknown_report_404():
    resp = client.post("/matcher/approve", json={
        "report_id": "EXC-9999", "decision": "approved"})
    assert resp.status_code == 404
