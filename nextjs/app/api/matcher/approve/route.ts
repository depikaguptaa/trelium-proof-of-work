import { NextResponse } from "next/server";
import { approveReport, StoreError } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.report_id) {
    return NextResponse.json({ detail: "report_id is required" }, { status: 422 });
  }
  try {
    const result = await approveReport(
      body.report_id,
      body.decision ?? "",
      body.approver ?? "ops-lead",
      body.note ?? "",
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    throw err;
  }
}
