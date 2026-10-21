import { NextResponse } from "next/server";
import { listCrmEntries } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ entries: await listCrmEntries() });
}
