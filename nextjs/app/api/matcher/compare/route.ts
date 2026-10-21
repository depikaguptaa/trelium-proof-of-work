import { NextResponse } from "next/server";
import { compare } from "@/lib/matcher";
import { saveReport } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.po || !body?.invoice) {
    return NextResponse.json(
      { detail: "body must contain po and invoice documents" },
      { status: 422 },
    );
  }
  const report = await saveReport(compare(body.po, body.invoice));
  return NextResponse.json(report);
}
