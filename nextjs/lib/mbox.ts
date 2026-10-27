import type { EmailMessage } from "./types";

// Real inbox ingestion for the scout.
//
// Turns a real exported mailbox into the same EmailMessage shape the
// scout already analyzes, so the scout does not care whether its input
// came from hand written JSON or a real inbox. No dependencies, no
// network, no OAuth: the user exports the mail themselves (Gmail
// Takeout produces .mbox) and uploads the file.
//
// Supported input:
// - .mbox: any number of RFC 822 messages separated by "From " lines
// - .eml: a single RFC 822 message
// Headers are unfolded, RFC 2047 encoded words are decoded, bodies
// are decoded from base64 and quoted-printable, multipart messages
// prefer text/plain and fall back to stripped text/html. Attachments
// are ignored. A message with no subject and no body text is skipped
// and counted, never silently dropped.

export interface ParsedMailbox {
  emails: EmailMessage[];
  skipped: number;
}

interface HeaderBlock {
  headers: Map<string, string>;
  bodyStart: number;
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

// Split mbox text into raw message blocks. A separator is a line that
// starts with "From " at the beginning of a line. Lines inside a body
// that were escaped as ">From " are unescaped back to "From ".
export function splitMbox(text: string): string[] {
  const lines = splitLines(text);
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith("From ")) {
      // Push even an empty block: two separators in a row mean an
      // empty message, which counts as skipped downstream. The final
      // block is only pushed below when it has content, so a file
      // ending on a separator does not invent a phantom message.
      if (current !== null) {
        blocks.push(current.join("\n"));
      }
      current = [];
      continue;
    }
    if (current === null) {
      // Leading content before the first separator is not a message.
      continue;
    }
    current.push(line.startsWith(">From ") ? line.slice(1) : line);
  }
  if (current !== null && current.length > 0) {
    blocks.push(current.join("\n"));
  }
  return blocks;
}

function unfoldHeaders(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && out.length > 0) {
      out[out.length - 1] += " " + line.trim();
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseHeaders(raw: string): HeaderBlock {
  const lines = splitLines(raw);
  let bodyStart = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "") {
      bodyStart = i + 1;
      break;
    }
  }
  const headers = new Map<string, string>();
  for (const line of unfoldHeaders(lines.slice(0, bodyStart))) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
  return { headers, bodyStart };
}

export function decodeQuotedPrintable(input: string): string {
  // Soft line breaks first, then =XX hex escapes. A bare "=" that is
  // not part of either is left as is rather than guessed at.
  const withoutSoftBreaks = input.replace(/=\r?\n/g, "");
  return withoutSoftBreaks.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

// Decode one RFC 2047 encoded word, =?charset?B|Q?text?=, or return
// the input unchanged when it is not one.
const ENCODED_WORD_RE = /^=\?([^?]+)\?([bBqQ])\?([^?]*)\?=$/;

function decodeEncodedWord(word: string): string {
  const match = word.match(ENCODED_WORD_RE);
  if (!match) return word;
  const charset = match[1];
  const encoding = match[2].toUpperCase();
  const text = match[3];
  let bytes: Buffer;
  if (encoding === "B") {
    bytes = Buffer.from(text, "base64");
  } else {
    bytes = Buffer.from(decodeQuotedPrintable(text.replace(/_/g, " ")), "latin1");
  }
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString("utf-8");
  }
}

export function decodeHeader(value: string): string {
  // RFC 2047: whitespace between two adjacent encoded words is
  // ignored, so "=?..?= =?..?=" decodes with no space in between.
  // Whitespace next to plain words is kept as a single space.
  const tokens = value.split(/\s+/);
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const encoded = ENCODED_WORD_RE.test(tokens[i]);
    const prevEncoded = i > 0 && ENCODED_WORD_RE.test(tokens[i - 1]);
    if (i > 0 && !(encoded && prevEncoded)) {
      out += " ";
    }
    out += encoded ? decodeEncodedWord(tokens[i]) : tokens[i];
  }
  return out.replace(/\s+/g, " ").trim();
}

function decodeBodyText(
  bodyText: string,
  encoding: string,
  charset: string,
): string {
  const enc = encoding.toLowerCase();
  if (enc === "base64") {
    const bytes = Buffer.from(bodyText.replace(/\s+/g, ""), "base64");
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return bytes.toString("utf-8");
    }
  }
  if (enc === "quoted-printable") {
    const bytes = Buffer.from(
      decodeQuotedPrintable(bodyText),
      "latin1",
    );
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return bytes.toString("utf-8");
    }
  }
  // 7bit, 8bit, binary, or no encoding declared: the text is already
  // decoded by the file read, so pass it through untouched.
  return bodyText;
}

function parseContentType(
  value: string | undefined,
): { type: string; charset: string; boundary: string | null } {
  const parts = (value ?? "text/plain").split(";");
  const type = parts[0].trim().toLowerCase();
  let charset = "utf-8";
  let boundary: string | null = null;
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    let val = part.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    if (key === "charset") charset = val;
    if (key === "boundary") boundary = val;
  }
  return { type, charset, boundary };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|p|div|li|tr|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function splitMultipart(body: string, boundary: string): string[] {
  const delimiter = "--" + boundary;
  const parts: string[] = [];
  let current: string[] | null = null;
  for (const line of splitLines(body)) {
    // Boundary lines may carry trailing whitespace; match on the
    // trimmed end so a padded delimiter still splits.
    const trimmed = line.trimEnd();
    if (trimmed === delimiter) {
      if (current !== null) parts.push(current.join("\n"));
      current = [];
    } else if (trimmed === delimiter + "--") {
      if (current !== null) parts.push(current.join("\n"));
      current = null;
    } else if (current !== null) {
      current.push(line);
    }
  }
  return parts;
}

// Extract the readable text of one message part. Returns null when
// the part is an attachment or has no usable text.
function extractPartText(raw: string): string | null {
  const { headers, bodyStart } = parseHeaders(raw);
  const lines = splitLines(raw);
  const bodyText = lines.slice(bodyStart).join("\n");
  const disposition = (headers.get("content-disposition") ?? "").toLowerCase();
  if (disposition.startsWith("attachment")) return null;

  const { type, charset, boundary } = parseContentType(
    headers.get("content-type"),
  );
  const encoding = headers.get("content-transfer-encoding") ?? "7bit";

  if (type.startsWith("multipart/") && boundary) {
    const plain: string[] = [];
    const html: string[] = [];
    for (const part of splitMultipart(bodyText, boundary)) {
      const { headers: partHeaders } = parseHeaders(part);
      const partType = parseContentType(partHeaders.get("content-type")).type;
      const text = extractPartText(part);
      if (text === null) continue;
      if (partType === "text/plain") plain.push(text);
      else if (partType === "text/html") html.push(text);
    }
    if (plain.length > 0) return plain.join("\n");
    if (html.length > 0) return html.join("\n");
    return null;
  }

  if (type === "text/plain") {
    return decodeBodyText(bodyText, encoding, charset).trim();
  }
  if (type === "text/html") {
    return stripHtml(decodeBodyText(bodyText, encoding, charset));
  }
  return null;
}

function senderAddress(raw: string): string {
  const match = raw.match(/<([^<>]+)>/);
  if (match) return match[1].trim();
  // Bare address, possibly with a trailing "(Real Name)" comment.
  return raw
    .replace(/\s*\([^()]*\)\s*$/, "")
    .replace(/^"|"$/g, "")
    .trim();
}

// Parse one RFC 822 message. Returns null when it carries nothing
// usable, so the caller can count it as skipped.
export function parseMessage(
  raw: string,
  fallbackId: string,
): EmailMessage | null {
  const { headers } = parseHeaders(raw);
  const subject = headers.has("subject")
    ? decodeHeader(headers.get("subject")!)
    : "";
  const sender = headers.has("from")
    ? senderAddress(decodeHeader(headers.get("from")!))
    : "";
  const body = extractPartText(raw) ?? "";

  if (subject === "" && body === "") return null;

  let id = fallbackId;
  const messageId = headers.get("message-id");
  if (messageId) {
    id = messageId.replace(/^<|>$/g, "").trim() || fallbackId;
  }
  return { id, subject, body, sender: sender || undefined };
}

export function parseMbox(text: string): ParsedMailbox {
  const emails: EmailMessage[] = [];
  let skipped = 0;
  const blocks = splitMbox(text);
  blocks.forEach((block, i) => {
    const parsed = parseMessage(block, "mbox-" + (i + 1));
    if (parsed) emails.push(parsed);
    else skipped += 1;
  });
  return { emails, skipped };
}

export function parseEml(text: string): ParsedMailbox {
  const parsed = parseMessage(text, "eml-1");
  return parsed ? { emails: [parsed], skipped: 0 } : { emails: [], skipped: 1 };
}

// Sniff the input: a leading "From " line means mbox, anything else
// is treated as one message.
export function parseMailbox(text: string): ParsedMailbox {
  const firstLine = splitLines(text).find((line) => line.trim() !== "");
  if (firstLine !== undefined && firstLine.startsWith("From ")) {
    return parseMbox(text);
  }
  return parseEml(text);
}
