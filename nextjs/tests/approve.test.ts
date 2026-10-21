import { beforeAll, describe, expect, it } from "vitest";

// Point Prisma at the test SQLite file before lib/prisma creates a client.
process.env.DATABASE_URL = "file:./trelium-test.db";

import { compare } from "@/lib/matcher";
import { sampleInvoice, samplePo } from "@/lib/data";
import { approveReport, listCrmEntries, saveReport, StoreError } from "@/lib/store";

describe("approval flow (SQLite persistence)", () => {
  beforeAll(async () => {
    const { getDb } = await import("@/lib/prisma");
    await getDb().crmLogEntry.deleteMany();
    await getDb().approval.deleteMany();
    await getDb().matchReport.deleteMany();
  });

  it("persists a report, approves it once, logs to the CRM, then 409s", async () => {
    const saved = await saveReport(compare(samplePo(), sampleInvoice()));
    expect(saved.report_id).toMatch(/^EXC-[0-9A-F]{8}$/);
    expect(saved.status).toBe("EXCEPTION");
    expect(saved.approval.state).toBe("pending");

    const { report, crm_entry } = await approveReport(
      saved.report_id,
      "approved",
      "ops-lead",
      "vendor confirmed",
    );
    expect(report.approval.state).toBe("approved");
    expect(report.approval.approver).toBe("ops-lead");
    expect(crm_entry.system).toBe("mock-crm");
    expect(crm_entry.decision).toBe("approved");

    const entries = await listCrmEntries();
    expect(entries.some((e) => e.report_id === saved.report_id)).toBe(true);

    await expect(
      approveReport(saved.report_id, "rejected", "ops-lead", ""),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("unknown report is a 404", async () => {
    await expect(
      approveReport("EXC-9999", "approved", "ops-lead", ""),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("bad decision is a 422", async () => {
    const saved = await saveReport(compare(samplePo(), sampleInvoice()));
    await expect(
      approveReport(saved.report_id, "maybe", "ops-lead", ""),
    ).rejects.toBeInstanceOf(StoreError);
    await expect(
      approveReport(saved.report_id, "maybe", "ops-lead", ""),
    ).rejects.toMatchObject({ status: 422 });
  });
});
