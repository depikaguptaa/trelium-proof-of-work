import { NextResponse } from "next/server";
import { analyze } from "@/lib/scout";
import type { EmailMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const emails: EmailMessage[] = Array.isArray(body?.emails) ? body.emails : [];
  return NextResponse.json(analyze(emails));
}
