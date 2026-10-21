import json
from pathlib import Path

from app.models import EmailMessage
from app.scout import analyze

DATA = Path(__file__).resolve().parent.parent / "data"


def sample_emails():
    return [EmailMessage(**e) for e in json.loads((DATA / "sample_emails.json").read_text())]


def test_scout_clusters_and_ranks_by_frequency_times_time():
    result = analyze(sample_emails())
    assert result["emails_analyzed"] == 18
    tasks = {c["task"]: c for c in result["clusters"]}
    assert tasks["order_reentry"]["frequency"] == 6
    assert tasks["order_reentry"]["minutes_total"] == 6 * 18
    # ranked descending by score
    scores = [c["score"] for c in result["clusters"]]
    assert scores == sorted(scores, reverse=True)


def test_scout_top_opportunity_has_paul_shape():
    top = analyze(sample_emails())["top_opportunity"]
    assert top["task"] == "order_reentry"
    assert "frequency" in top["reasoning"] or "appears 6 times" in top["reasoning"]
    # Paul's three outputs: opportunity + reasoning + ready-made agent prompt
    assert top["agent_prompt"]
    assert "ERP" in top["agent_prompt"]


def test_scout_empty_input():
    result = analyze([])
    assert result["emails_analyzed"] == 0
    assert result["top_opportunity"] is None
