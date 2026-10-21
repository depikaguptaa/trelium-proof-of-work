import { NextResponse } from "next/server";
import { compare } from "@/lib/matcher";
import { extractDocument, IngestError } from "@/lib/ingest";
import { saveReport } from "@/lib/store";
import type { MatchDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST multipart form with two PDF files, fields "po" and "invoice".
// Both are extracted into MatchDocuments, compared, persisted, and the
// report is returned in the same shape as /api/matcher/demo.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { detail: "expected a multipart form with po and invoice PDF files" },
      { status: 400 },
    );
  }

  const files: { name: "po" | "invoice"; file: FormDataEntryValue | null }[] = [
    { name: "po", file: form.get("po") },
    { name: "invoice", file: form.get("invoice") },
  ];
  for (const { name, file } of files) {
    if (!(file instanceof File)) {
      return NextResponse.json(
        { detail: `missing file: ${name}` },
        { status: 400 },
      );
    }
  }

  const docs: Partial<Record<"po" | "invoice", MatchDocument>> = {};
  for (const { name, file } of files) {
    try {
      docs[name] = await extractDocument(
        new Uint8Array(await (file as File).arrayBuffer()),
      );
    } catch (err) {
      if (err instanceof IngestError) {
        return NextResponse.json(
          { detail: `${name} PDF: ${err.message}` },
          { status: 400 },
        );
      }
      throw err;
    }
  }

  const report = await saveReport(compare(docs.po!, docs.invoice!));
  return NextResponse.json(report);
}
