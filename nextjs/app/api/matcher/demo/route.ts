import { NextResponse } from "next/server";
import { compare } from "@/lib/matcher";
import { saveReport } from "@/lib/store";
import { sampleInvoice, samplePo } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await saveReport(compare(samplePo(), sampleInvoice()));
  return NextResponse.json(report);
}
