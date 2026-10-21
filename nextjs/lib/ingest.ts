import { extractTextItems } from "unpdf";
import type { LineItem, MatchDocument } from "./types";

// PDF ingestion for the matcher.
//
// Turns the bytes of a PO or invoice PDF into the same MatchDocument
// shape the JSON fixtures use, so the deterministic matcher does not
// care where a document came from. Extraction is rule and regex based
// on the PDF text layer, no LLM, no guessing: if a required field is
// not found, IngestError names the field and the caller returns a 400.
//
// Supported layout is the sample layout in data/sample_po.pdf and
// data/sample_invoice.pdf: a "Document: <id>" line, one table row per
// line item (SKU, description, qty, unit price, amount), then
// "Freight: $x" and "Setup fee: $x" lines.

export class IngestError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

interface TextItem {
  str: string;
  x: number;
  y: number;
}

// Group a page's positioned text items into lines: items whose y is
// within 2 points belong to the same line. Lines come back top first,
// items within a line left first, joined with single spaces.
function toLines(items: TextItem[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: TextItem[] }[] = [];
  for (const item of sorted) {
    if (item.str === "") continue;
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - item.y) <= 2) {
      line.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  return lines.map((line) =>
    line.items
      .sort((a, b) => a.x - b.x)
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function parseMoney(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

const DOC_ID_RE = /^Document:\s*(\S+)$/;
const ROW_RE =
  /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\s+(.+?)\s+(\d+)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})$/;
const FREIGHT_RE = /^Freight:\s*\$?([\d,]+\.\d{2})/;
const SETUP_FEE_RE = /^Setup fee:\s*\$?([\d,]+\.\d{2})/;

export async function extractDocument(bytes: Uint8Array): Promise<MatchDocument> {
  let pages: TextItem[][];
  try {
    const result = await extractTextItems(bytes);
    pages = result.items;
  } catch {
    throw new IngestError("pdf", "could not read text from the PDF");
  }
  const lines = pages.flatMap((pageItems) => toLines(pageItems));

  let docId: string | null = null;
  let freight: number | null = null;
  let setupFee: number | null = null;
  const lineItems: LineItem[] = [];

  for (const line of lines) {
    const docMatch = line.match(DOC_ID_RE);
    if (docMatch) {
      docId = docMatch[1];
      continue;
    }
    const rowMatch = line.match(ROW_RE);
    if (rowMatch) {
      lineItems.push({
        sku: rowMatch[1],
        description: rowMatch[2],
        qty: Number(rowMatch[3]),
        unit_price: parseMoney(rowMatch[4]),
      });
      continue;
    }
    const freightMatch = line.match(FREIGHT_RE);
    if (freightMatch) {
      freight = parseMoney(freightMatch[1]);
      continue;
    }
    const setupMatch = line.match(SETUP_FEE_RE);
    if (setupMatch) {
      setupFee = parseMoney(setupMatch[1]);
    }
  }

  if (!docId) {
    throw new IngestError("doc_id", "could not extract doc_id from PDF");
  }
  if (lineItems.length === 0) {
    throw new IngestError("line_items", "could not extract line_items from PDF");
  }
  if (freight === null) {
    throw new IngestError("freight", "could not extract freight from PDF");
  }
  if (setupFee === null) {
    throw new IngestError("setup_fee", "could not extract setup_fee from PDF");
  }

  return { doc_id: docId, line_items: lineItems, freight, setup_fee: setupFee };
}
