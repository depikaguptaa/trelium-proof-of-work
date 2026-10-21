"use client";

import { useCallback, useEffect, useState } from "react";
import type { CrmEntry, MatchReportData, ScoutResult } from "@/lib/types";

export default function Home() {
  const [scout, setScout] = useState<ScoutResult | null>(null);
  const [report, setReport] = useState<MatchReportData | null>(null);
  const [crm, setCrm] = useState<CrmEntry[]>([]);
  const [notice, setNotice] = useState("");

  const loadCrm = useCallback(async () => {
    const res = await fetch("/api/crm/log");
    if (res.ok) setCrm((await res.json()).entries);
  }, []);

  const loadDemo = useCallback(async () => {
    const [s, m] = await Promise.all([
      fetch("/api/scout/demo").then((r) => r.json()),
      fetch("/api/matcher/demo").then((r) => r.json()),
    ]);
    setScout(s);
    setReport(m);
    setNotice("");
    await loadCrm();
  }, [loadCrm]);

  useEffect(() => {
    loadDemo();
  }, [loadDemo]);

  async function decide(decision: "approved" | "rejected") {
    if (!report) return;
    const res = await fetch("/api/matcher/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report_id: report.report_id,
        decision,
        approver: "ops-lead",
        note: decision === "approved" ? "vendor confirmed" : "needs correction",
      }),
    });
    const payload = await res.json();
    if (res.status === 409) {
      setNotice("This report was already decided. A report can only be decided once.");
      return;
    }
    if (res.ok) {
      setReport(payload.report);
      setNotice(`Decision saved: ${decision}. It is logged in the CRM log below.`);
      await loadCrm();
    }
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" }}>
      <h1 style={{ fontSize: 26 }}>Paul-lite + PO/Invoice Matcher</h1>
      <p style={{ color: "#444", lineHeight: 1.5 }}>
        A working demo of Trelium&apos;s two public products, built by Depika Gupta.
        The scout reads a sample email export and ranks repetitive back office work.
        The matcher compares a purchase order with a vendor invoice using plain
        rules, and nothing is paid until a human decides.
      </p>

      <section>
        <h2 style={{ fontSize: 19 }}>Automation Scout</h2>
        {!scout ? (
          <p>Loading…</p>
        ) : (
          <>
            <p>
              Analyzed {scout.emails_analyzed} emails. Ranked by frequency times
              minutes per occurrence:
            </p>
            <table cellPadding={6} style={{ borderCollapse: "collapse", background: "#fff" }}>
              <thead>
                <tr>
                  <th align="left">Task</th>
                  <th align="right">Frequency</th>
                  <th align="right">Min each</th>
                  <th align="right">Min total</th>
                </tr>
              </thead>
              <tbody>
                {scout.clusters.map((c) => (
                  <tr key={c.task} style={{ borderTop: "1px solid #eee" }}>
                    <td>{c.task}</td>
                    <td align="right">{c.frequency}</td>
                    <td align="right">{c.minutes_per_occurrence}</td>
                    <td align="right">{c.minutes_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scout.top_opportunity && (
              <div style={{ background: "#fff", border: "1px solid #e5e5e5", padding: 16, marginTop: 16 }}>
                <strong>Top opportunity: {scout.top_opportunity.task}</strong>
                <p style={{ lineHeight: 1.5 }}>{scout.top_opportunity.reasoning}</p>
                <p style={{ lineHeight: 1.5, marginBottom: 0 }}>
                  <em>Agent prompt:</em> {scout.top_opportunity.agent_prompt}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 19 }}>PO/Invoice Matcher</h2>
        {!report ? (
          <p>Loading…</p>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e5e5e5", padding: 16 }}>
            <p style={{ marginTop: 0 }}>
              Report {report.report_id}: {report.po_id} vs {report.invoice_id},{" "}
              status <strong>{report.status}</strong>, {report.mismatch_count}{" "}
              mismatches, total delta ${report.total_delta.toFixed(2)}.
            </p>
            <ul>
              {report.mismatches.map((m, i) => (
                <li key={i}>
                  {m.field}
                  {m.sku ? ` (${m.sku})` : ""}: PO {m.po_value} vs invoice{" "}
                  {m.invoice_value}, delta {m.delta} ({m.severity})
                </li>
              ))}
            </ul>
            <p>
              Approval state: <strong>{report.approval.state}</strong>
              {report.approval.approver ? ` by ${report.approval.approver}` : ""}
            </p>
            {report.approval.state === "pending" && (
              <p>
                <button onClick={() => decide("approved")} style={{ marginRight: 8, padding: "8px 14px" }}>
                  Approve
                </button>
                <button onClick={() => decide("rejected")} style={{ padding: "8px 14px" }}>
                  Reject
                </button>
              </p>
            )}
            {notice && <p style={{ color: "#065f46" }}>{notice}</p>}
            <button onClick={loadDemo} style={{ padding: "6px 12px" }}>
              Run a fresh demo report
            </button>
          </div>
        )}
      </section>

      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 19 }}>CRM log (mock)</h2>
        {crm.length === 0 ? (
          <p>No decisions logged yet.</p>
        ) : (
          <ul>
            {crm.map((e, i) => (
              <li key={i}>
                {e.report_id}: {e.decision} by {e.approver} ({e.note})
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
