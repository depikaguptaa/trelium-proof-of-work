# Paul-lite + PO/Invoice Matcher — a proof-of-work for Trelium

Built by Depika Gupta as a working demo of Trelium's two public products,
in her own stack (FastAPI / Python). No API key needed, nothing here touches
Trelium's codebase.

## What it does

**1. Automation Scout (`/scout`) — a 'Paul-lite'**
Paul (Trelium's scout agent) watches how work moves and returns the
opportunity, the reasoning, and a ready-made prompt to build the agent.
This scout does the same over an email/thread export:

- clusters messages into repetitive back-office tasks (order re-entry,
  status chases, invoice mismatches, proof approvals, quote requests)
- ranks them by **frequency × human minutes per occurrence**
- outputs the top opportunity with reasoning + a plain-English agent
  prompt/spec, in Paul's exact output shape

Clustering is deterministic (keyword rules in `app/scout.py`). An LLM could
polish the wording later — it should never decide the ranking.

**2. Deterministic PO/Invoice Matcher (`/matcher`)**
- ingests a PO and a vendor invoice (structured fixtures in `data/`;
  PDF/text extraction would produce the same shape upstream)
- compares qty, unit price, freight and setup fee with a pure rules
  engine — deterministic where it matters, no LLM in the decision path
- emits an **exception report**: both values, the delta, severity
- **human-in-the-loop:** an exception stays `pending` until a human
  approves/rejects it; the decision is logged to a mock CRM
  (`app/crm.py` — in production this is one webhook POST to
  HubSpot/Salesforce/a sheet)

The demo fixture reproduces Trelium's own public example: PO freight
$4,000 vs invoice $4,200 = **$200 delta, 2 fields don't match**
(the second mismatch in this synthetic fixture is a hoodie unit price,
$24.00 vs $24.75).

## Run it

```bash
cd yc-trelium
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8077
```

Then:

```bash
curl localhost:8077/scout/demo        # 18 synthetic emails -> ranked tasks + Paul-style output
curl localhost:8077/matcher/demo      # PO-1042 vs INV-7781 -> EXCEPTION, 2 mismatches, $200 freight delta
curl -X POST localhost:8077/matcher/approve \
  -H 'Content-Type: application/json' \
  -d '{"report_id":"EXC-0001","decision":"approved","approver":"ops-lead","note":"vendor confirmed"}'
curl localhost:8077/crm/log           # the approval, logged to the mock CRM
```

Interactive docs at `http://localhost:8077/docs`.

## Tests

```bash
.venv/bin/python -m pytest -q
# 10 passed
```

Tests cover: scout clustering/ranking and Paul-shaped output, the
Trelium freight example verbatim, a clean MATCH case, qty/setup-fee
detection, the full API flow including approve-once (409 on a second
decision) and the mock-CRM log.

## Layout

```
app/main.py      FastAPI routes
app/scout.py     Automation Scout (clustering + ranking + agent prompt)
app/matcher.py   deterministic rules engine + exception reports
app/crm.py       mock CRM log (webhook stub)
app/models.py    pydantic schemas
data/            synthetic emails, PO, invoice fixtures
tests/           pytest (scout, matcher, api)
```

## What I'd build next

1. Real ingestion: Gmail/Outlook export + PDF extraction into the same
   `Document` schema, with per-field confidence and source citations.
2. The agent runtime behind the scout's prompts: run the generated
   plain-English spec as a LangGraph workflow with tool calls into a
   real ERP/CRM sandbox, with LLM-observability traces on every run.
3. A proper eval harness: labelled email exports and PO/invoice pairs,
   scoring cluster accuracy and matcher precision/recall on every change.
