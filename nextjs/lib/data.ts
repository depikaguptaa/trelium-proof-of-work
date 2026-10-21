import { readFileSync } from "node:fs";
import path from "node:path";
import type { EmailMessage, MatchDocument } from "./types";

const DATA = path.join(process.cwd(), "data");

function load<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(DATA, name), "utf-8")) as T;
}

export function sampleEmails(): EmailMessage[] {
  return load<EmailMessage[]>("sample_emails.json");
}

export function samplePo(): MatchDocument {
  return load<MatchDocument>("sample_po.json");
}

export function sampleInvoice(): MatchDocument {
  return load<MatchDocument>("sample_invoice.json");
}
