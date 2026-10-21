import { NextResponse } from "next/server";
import { analyze } from "@/lib/scout";
import { sampleEmails } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(analyze(sampleEmails()));
}
