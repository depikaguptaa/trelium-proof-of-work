import { NextResponse } from "next/server";
import { parseMailbox } from "@/lib/mbox";
import { analyze } from "@/lib/scout";

export const dynamic = "force-dynamic";

// POST multipart form with one mailbox file, field "file": a Gmail
// Takeout .mbox export, or a single .eml message. The file is parsed
// into EmailMessages and run through the same scout analysis as
// /api/scout/analyze, so the scout works on a real inbox export
// instead of hand written JSON. The response is the ScoutResult plus
// a parsed count of messages kept and skipped. Files over 25 MB are
// rejected: a mailbox that big should be trimmed to the date range
// being analyzed before upload.
export const MAX_MAILBOX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { detail: "expected a multipart form with a mailbox file" },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { detail: "missing file: file" },
      { status: 400 },
    );
  }

  if (file.size > MAX_MAILBOX_BYTES) {
    return NextResponse.json(
      {
        detail:
          "mailbox file is over 25 MB, trim the export to the date range being analyzed",
      },
      { status: 400 },
    );
  }
  const text = await file.text();
  if (text.trim() === "") {
    return NextResponse.json(
      { detail: "mailbox file is empty" },
      { status: 400 },
    );
  }

  const parsed = parseMailbox(text);
  if (parsed.emails.length === 0) {
    return NextResponse.json(
      {
        detail:
          "no readable messages in the mailbox file, skipped " +
          parsed.skipped,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ...analyze(parsed.emails),
    parsed: {
      messages: parsed.emails.length,
      skipped: parsed.skipped,
    },
  });
}
