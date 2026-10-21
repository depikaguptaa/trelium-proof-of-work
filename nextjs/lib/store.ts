import type { Prisma } from "@prisma/client";
import { getDb } from "./prisma";
import type { CrmEntry, MatchReportData } from "./types";

// Persistence for matcher reports, approvals, and the CRM log.
// Postgres by default (prisma/schema.prisma), SQLite in dev fallback.

export class StoreError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ReportRow = Prisma.MatchReportGetPayload<{ include: { approval: true } }>;

function toReportData(row: ReportRow): MatchReportData {
  return {
    report_id: row.id,
    po_id: row.poId,
    invoice_id: row.invoiceId,
    status: row.status as MatchReportData["status"],
    fields_checked: JSON.parse(row.fieldsChecked),
    mismatch_count: row.mismatchCount,
    mismatches: JSON.parse(row.mismatches),
    total_delta: row.totalDelta,
    approval: {
      state: row.approvalState,
      approver: row.approval?.approver ?? null,
      note: row.approval?.note ?? "",
    },
  };
}

export async function saveReport(data: MatchReportData): Promise<MatchReportData> {
  const db = getDb();
  const count = await db.matchReport.count();
  const id = `EXC-${String(count + 1).padStart(4, "0")}`;
  const row = await db.matchReport.create({
    data: {
      id,
      poId: data.po_id,
      invoiceId: data.invoice_id,
      status: data.status,
      fieldsChecked: JSON.stringify(data.fields_checked),
      mismatchCount: data.mismatch_count,
      mismatches: JSON.stringify(data.mismatches),
      totalDelta: data.total_delta,
      approvalState: data.approval.state,
    },
    include: { approval: true },
  });
  return toReportData(row);
}

export async function getReport(reportId: string): Promise<MatchReportData | null> {
  const row = await getDb().matchReport.findUnique({
    where: { id: reportId },
    include: { approval: true },
  });
  return row ? toReportData(row) : null;
}

// Human-in-the-loop decision. Mirrors the Python version:
// unknown report 404, bad decision 422, second decision 409.
export async function approveReport(
  reportId: string,
  decision: string,
  approver: string = "ops-lead",
  note: string = "",
): Promise<{ report: MatchReportData; crm_entry: CrmEntry }> {
  const db = getDb();
  const row = await db.matchReport.findUnique({
    where: { id: reportId },
    include: { approval: true },
  });
  if (!row) {
    throw new StoreError(404, `report ${reportId} not found`);
  }
  if (decision !== "approved" && decision !== "rejected") {
    throw new StoreError(422, "decision must be 'approved' or 'rejected'");
  }
  if (row.approvalState !== "pending") {
    throw new StoreError(409, `report already ${row.approvalState}`);
  }

  // The updateMany guard keeps the decide-once rule atomic: if a
  // concurrent request already decided this report, count is 0.
  const updated = await db.matchReport.updateMany({
    where: { id: reportId, approvalState: "pending" },
    data: { approvalState: decision },
  });
  if (updated.count === 0) {
    throw new StoreError(409, `report already decided`);
  }

  await db.approval.create({
    data: { reportId, decision, approver, note },
  });
  const crm = await db.crmLogEntry.create({
    data: {
      system: "mock-crm",
      event: "po_invoice_approval",
      reportId,
      decision,
      approver,
      note,
      matchStatus: row.status,
      mismatchCount: row.mismatchCount,
    },
  });

  const report = await getReport(reportId);
  if (!report) {
    throw new StoreError(404, `report ${reportId} not found`);
  }
  return {
    report,
    crm_entry: {
      system: crm.system,
      event: crm.event,
      report_id: crm.reportId,
      decision: crm.decision,
      approver: crm.approver,
      note: crm.note,
      match_status: crm.matchStatus,
      mismatch_count: crm.mismatchCount,
    },
  };
}

export async function listCrmEntries(): Promise<CrmEntry[]> {
  const rows = await getDb().crmLogEntry.findMany({ orderBy: { id: "asc" } });
  return rows.map((r) => ({
    system: r.system,
    event: r.event,
    report_id: r.reportId,
    decision: r.decision,
    approver: r.approver,
    note: r.note,
    match_status: r.matchStatus,
    mismatch_count: r.mismatchCount,
  }));
}
