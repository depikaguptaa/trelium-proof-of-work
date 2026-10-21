import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractDocument, IngestError } from "@/lib/ingest";
import { compare } from "@/lib/matcher";
import { sampleInvoice, samplePo } from "@/lib/data";

const DATA = path.join(process.cwd(), "data");

function pdfBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(DATA, name)));
}

describe("PDF ingest", () => {
  it("extracts the sample PO PDF into exactly the JSON fixture", async () => {
    const doc = await extractDocument(pdfBytes("sample_po.pdf"));
    expect(doc).toEqual(samplePo());
  });

  it("extracts the sample invoice PDF into exactly the JSON fixture", async () => {
    const doc = await extractDocument(pdfBytes("sample_invoice.pdf"));
    expect(doc).toEqual(sampleInvoice());
  });

  it("comparing the extracted PDFs reproduces the freight example", async () => {
    const po = await extractDocument(pdfBytes("sample_po.pdf"));
    const invoice = await extractDocument(pdfBytes("sample_invoice.pdf"));
    const report = compare(po, invoice);
    expect(report.status).toBe("EXCEPTION");
    expect(report.mismatch_count).toBe(2);
    const freight = report.mismatches.filter((m) => m.field === "freight");
    expect(freight).toHaveLength(1);
    expect(freight[0].delta).toBe(200);
    expect(report.total_delta).toBe(200);
  });

  it("names the missing field when a required field is absent", async () => {
    // A plausible looking document that simply has no freight line.
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = [
      "Document: PO-9999",
      "TEE-BLK-M Black tee, medium, screen print 500 $8.50 $4,250.00",
      "Setup fee: $150.00",
      "Total: $4,400.00",
    ];
    lines.forEach((line, i) => {
      page.drawText(line, { x: 50, y: 742 - i * 20, size: 11, font });
    });
    const bytes = new Uint8Array(await pdf.save());

    const err = await extractDocument(bytes).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IngestError);
    expect((err as IngestError).field).toBe("freight");
    expect((err as IngestError).message).toContain("freight");
  });

  it("rejects bytes that are not a PDF", async () => {
    const err = await extractDocument(
      new TextEncoder().encode("this is not a pdf"),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IngestError);
    expect((err as IngestError).field).toBe("pdf");
  });
});
