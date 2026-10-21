// Generates data/sample_po.pdf and data/sample_invoice.pdf from the
// JSON fixtures, so the sample PDFs always match the sample documents
// field for field. Run with: npm run pdfs:generate
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

function load(name) {
  return JSON.parse(readFileSync(path.join(DATA, name), "utf-8"));
}

function money(n) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const BUYER = {
  name: "Meridian Retail Group",
  line: "400 Commerce Street, Austin, TX 78701",
};
const VENDOR = {
  name: "Northgate Print Co.",
  line: "88 Industrial Parkway, Dallas, TX 75207",
};

async function buildPdf({ doc, kind, issuer, other, date }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.35, 0.35, 0.35);

  let y = 742;
  page.drawText(issuer.name, { x: 50, y, size: 18, font: bold, color: dark });
  y -= 18;
  page.drawText(issuer.line, { x: 50, y, size: 10, font: regular, color: gray });

  y -= 44;
  page.drawText(kind === "po" ? "PURCHASE ORDER" : "INVOICE", {
    x: 50,
    y,
    size: 16,
    font: bold,
    color: dark,
  });
  y -= 20;
  page.drawText(`Document: ${doc.doc_id}`, { x: 50, y, size: 11, font: regular, color: dark });
  y -= 16;
  page.drawText(`Date: ${date}`, { x: 50, y, size: 11, font: regular, color: dark });
  y -= 16;
  const otherLabel = kind === "po" ? "Vendor" : "Bill to";
  page.drawText(`${otherLabel}: ${other.name}, ${other.line}`, {
    x: 50,
    y,
    size: 11,
    font: regular,
    color: dark,
  });

  // Line items table. Each cell is drawn separately at a fixed x, all
  // cells of a row at the same y, which is what lib/ingest.ts groups on.
  const cols = { sku: 50, description: 150, qty: 370, unitPrice: 425, amount: 505 };
  y -= 40;
  page.drawText("SKU", { x: cols.sku, y, size: 11, font: bold, color: dark });
  page.drawText("Description", { x: cols.description, y, size: 11, font: bold, color: dark });
  page.drawText("Qty", { x: cols.qty, y, size: 11, font: bold, color: dark });
  page.drawText("Unit Price", { x: cols.unitPrice, y, size: 11, font: bold, color: dark });
  page.drawText("Amount", { x: cols.amount, y, size: 11, font: bold, color: dark });

  let itemsTotal = 0;
  for (const item of doc.line_items) {
    y -= 20;
    const amount = item.qty * item.unit_price;
    itemsTotal += amount;
    page.drawText(item.sku, { x: cols.sku, y, size: 11, font: regular, color: dark });
    page.drawText(item.description, { x: cols.description, y, size: 11, font: regular, color: dark });
    page.drawText(String(item.qty), { x: cols.qty, y, size: 11, font: regular, color: dark });
    page.drawText(`$${money(item.unit_price)}`, { x: cols.unitPrice, y, size: 11, font: regular, color: dark });
    page.drawText(`$${money(amount)}`, { x: cols.amount, y, size: 11, font: regular, color: dark });
  }

  y -= 36;
  page.drawText(`Freight: $${money(doc.freight)}`, { x: 50, y, size: 11, font: regular, color: dark });
  y -= 18;
  page.drawText(`Setup fee: $${money(doc.setup_fee)}`, { x: 50, y, size: 11, font: regular, color: dark });
  y -= 18;
  const total = itemsTotal + doc.freight + doc.setup_fee;
  page.drawText(`Total: $${money(total)}`, { x: 50, y, size: 12, font: bold, color: dark });

  if (kind === "invoice") {
    y -= 36;
    page.drawText("Terms: Net 30. Thank you for your business.", {
      x: 50,
      y,
      size: 10,
      font: regular,
      color: gray,
    });
  }

  return Buffer.from(await pdf.save());
}

const po = load("sample_po.json");
const invoice = load("sample_invoice.json");

writeFileSync(
  path.join(DATA, "sample_po.pdf"),
  await buildPdf({ doc: po, kind: "po", issuer: BUYER, other: VENDOR, date: "2026-10-14" }),
);
writeFileSync(
  path.join(DATA, "sample_invoice.pdf"),
  await buildPdf({ doc: invoice, kind: "invoice", issuer: VENDOR, other: BUYER, date: "2026-10-16" }),
);
console.log("wrote data/sample_po.pdf and data/sample_invoice.pdf");
