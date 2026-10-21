# Paul-lite + PO/Invoice Matcher, a proof-of-work for Trelium

Built by Depika Gupta as a working demo of Trelium's two public products.
No API key needed, nothing here touches Trelium's codebase.

This repo has two builds of the same demo:

- **TypeScript / Next.js build** in `nextjs/`, matching Trelium's stack
  (Next.js App Router, React, Prisma with Postgres). This is the main one.
- **Python / FastAPI build** at the repo root, the original version.

## What it does

**1. Automation Scout, a 'Paul-lite'**
Paul (Trelium's scout agent) watches how work moves and returns the
opportunity, the reasoning, and a ready-made prompt to build the agent.
This scout does the same over an email/thread export:

- clusters messages into repetitive back-office tasks (order re-entry,
  status chases, invoice mismatches, proof approvals, quote requests)
- ranks them by frequency x human minutes per occurrence
- outputs the top opportunity with reasoning and a plain-English agent
  prompt/spec, in Paul's exact output shape

Clustering is deterministic (keyword rules). An LLM could polish the
wording later, it should never decide the ranking.

**2. Deterministic PO/Invoice Matcher**
- ingests a PO and a vendor invoice (structured fixtures in `data/`).
  The TypeScript build also takes real PDFs: upload a PO PDF and an
  invoice PDF and it extracts the document number, line items, freight
  and setup fee from the PDF text into the same shape, for the sample
  layout (general vendor layouts are still future work)
- compares qty, unit price, freight and setup fee with a pure rules
  engine, deterministic where it matters, no LLM in the decision path
- emits an exception report: both values, the delta, severity
- human-in-the-loop: an exception stays pending until a human approves
  or rejects it; the decision is logged to a mock CRM log

The demo fixture reproduces Trelium's own public example: PO freight
$4,000 vs invoice $4,200 = $200 delta, 2 fields do not match
(the second mismatch in this synthetic fixture is a hoodie unit price,
$24.00 vs $24.75).

## Run the TypeScript build

```bash
cd nextjs
npm install
cp .env.example .env
docker compose up -d          # Postgres 16
npm run db:push
npm run dev                   # http://localhost:8077
```

The home page shows the scout clusters, the top opportunity, the matcher
report with Approve/Reject buttons, and the CRM log. API routes live
under `app/api/` (scout demo/analyze, matcher demo/compare/approve/
ingest, crm log, health).

No Docker handy? A SQLite schema with the same Prisma models is included
(`prisma/schema.sqlite.prisma`); see `nextjs/README.md` for that flow.
The build was verified end to end on the SQLite schema: production build
passes, the demo returns the same clusters and the same $200 freight
exception as the Python version, uploading the two sample PDFs returns
the same exception report, approving persists and a second decision
on the same report returns 409.

```bash
npm test                      # vitest, 14 tests
```

## Run the Python build

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8077
```

```bash
curl localhost:8077/scout/demo        # 18 synthetic emails, ranked tasks, Paul-style output
curl localhost:8077/matcher/demo      # PO-1042 vs INV-7781, EXCEPTION, 2 mismatches, $200 freight delta
curl -X POST localhost:8077/matcher/approve \
  -H 'Content-Type: application/json' \
  -d '{"report_id":"EXC-0001","decision":"approved","approver":"ops-lead","note":"vendor confirmed"}'
curl localhost:8077/crm/log           # the approval, logged to the mock CRM
```

```bash
.venv/bin/python -m pytest -q         # 10 passed
```

## Layout

```
nextjs/            TypeScript build (Next.js, React, Prisma, vitest)
  app/             UI page + API routes
  lib/             scout, matcher, ingest (PDF extraction), store (Prisma persistence)
  prisma/          Postgres schema + SQLite mirror
  tests/           vitest (scout, matcher, approve flow)
app/               Python build: FastAPI routes, scout, matcher, mock CRM
data/              synthetic emails, PO, invoice fixtures (shared shape)
tests/             pytest for the Python build
```

## What I'd build next

1. Wider ingestion: PDF extraction into the same document schema is
   built in the TypeScript build for the sample layout. Still to do:
   arbitrary vendor layouts, Gmail/Outlook export as a source, and
   per-field confidence with source citations.
2. The agent runtime behind the scout's prompts: run the generated
   plain-English spec as a workflow with tool calls into a real ERP/CRM
   sandbox, with LLM-observability traces on every run.
3. A proper eval harness: labelled email exports and PO/invoice pairs,
   scoring cluster accuracy and matcher precision/recall on every change.
