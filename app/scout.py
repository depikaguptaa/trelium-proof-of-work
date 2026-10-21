"""Automation Scout — a deterministic 'Paul-lite'.

Trelium's Paul watches how work moves and returns: the opportunity, the
reasoning, and a ready-made prompt to build the agent. This does the same
over an email export, with keyword clustering instead of an LLM so it runs
with no API key. `llm_polish()` is the optional seam: if a key is present
later, it only rewrites wording — never the ranking.
"""
from __future__ import annotations

import re
from collections import defaultdict

from .models import EmailMessage

# category -> (keywords, minutes a human spends per occurrence, plain-English agent)
CATEGORIES: dict[str, dict] = {
    "order_reentry": {
        "keywords": ["purchase order", "po #", "po number", "enter the order",
                     "re-enter", "order entry", "new order"],
        "minutes": 18,
        "agent": (
            "When a purchase order arrives by email, extract the customer, line "
            "items, quantities, prices and delivery date. Create the order in "
            "the ERP, then reply to the customer confirming the order number. "
            "If any field is missing or unreadable, ask for only that field and "
            "do not create the order."
        ),
    },
    "status_chase": {
        "keywords": ["where is", "status of", "tracking", "eta", "has it shipped",
                     "any update", "delivery date"],
        "minutes": 7,
        "agent": (
            "When a customer asks for an order status, find the order in the ERP, "
            "read its current production and shipping status, and reply with the "
            "status, the expected delivery date, and the tracking link if it has "
            "shipped. Never guess a date that is not in the ERP."
        ),
    },
    "invoice_mismatch": {
        "keywords": ["invoice", "freight", "billing", "overcharged", "discrepancy",
                     "doesn't match", "does not match"],
        "minutes": 22,
        "agent": (
            "When a vendor invoice arrives, match it against the purchase order "
            "line by line: quantities, unit prices, freight and setup fees. If "
            "everything matches, mark it ready to pay. If anything differs, "
            "produce an exception report showing both values and the delta, and "
            "wait for a human to approve or reject it before paying."
        ),
    },
    "proof_approval": {
        "keywords": ["proof", "mockup", "artwork", "approve the design", "pre-production"],
        "minutes": 11,
        "agent": (
            "When artwork is ready, generate a proof from the order's artwork file, "
            "send it to the customer for approval, and log the reply. If approved, "
            "move the order to production. If changes are requested, route the "
            "comments back to the design team with the order number attached."
        ),
    },
    "quote_request": {
        "keywords": ["quote", "quotation", "how much", "pricing for", "price for"],
        "minutes": 15,
        "agent": (
            "When a quote is requested, read the product, quantity and decoration "
            "method, look up pricing in the catalog, and draft a quote email. "
            "Show the draft to a human before sending if the total is above the "
            "configured threshold."
        ),
    },
}


def _classify(email: EmailMessage) -> str | None:
    text = f"{email.subject} {email.body}".lower()
    best, best_hits = None, 0
    for name, cfg in CATEGORIES.items():
        hits = sum(1 for kw in cfg["keywords"] if kw in text)
        if hits > best_hits:
            best, best_hits = name, hits
    return best


def analyze(emails: list[EmailMessage]) -> dict:
    buckets: dict[str, list[str]] = defaultdict(list)
    unclassified: list[str] = []
    for e in emails:
        cat = _classify(e)
        (buckets[cat].append(e.id) if cat else unclassified.append(e.id))

    clusters = []
    for name, ids in buckets.items():
        cfg = CATEGORIES[name]
        freq = len(ids)
        minutes = cfg["minutes"]
        clusters.append({
            "task": name,
            "frequency": freq,
            "minutes_per_occurrence": minutes,
            "minutes_total": freq * minutes,
            "score": freq * minutes,  # frequency x time — the ranking rule
            "email_ids": ids,
        })
    clusters.sort(key=lambda c: c["score"], reverse=True)

    top = None
    if clusters:
        best = clusters[0]
        cfg = CATEGORIES[best["task"]]
        top = {
            "task": best["task"],
            "reasoning": (
                f"'{best['task']}' appears {best['frequency']} times in this export "
                f"and takes ~{best['minutes_per_occurrence']} min each by hand — "
                f"{best['minutes_total']} min total, the highest frequency x time "
                f"score ({best['score']}) of any repetitive task found. It follows "
                f"the same steps every time and its inputs already arrive by email, "
                f"so it can be automated without changing how anyone works."
            ),
            "agent_prompt": cfg["agent"],
        }

    return {
        "emails_analyzed": len(emails),
        "unclassified": unclassified,
        "clusters": clusters,
        "top_opportunity": top,
    }
