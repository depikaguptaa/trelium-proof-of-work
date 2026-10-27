import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/scout";
import { sampleMboxText } from "@/lib/data";
import {
  decodeHeader,
  decodeQuotedPrintable,
  parseMailbox,
  parseMbox,
  parseMessage,
  splitMbox,
} from "@/lib/mbox";

describe("mbox fixture", () => {
  it("parses the sample inbox into the scout input shape", () => {
    const parsed = parseMbox(sampleMboxText());
    expect(parsed.emails).toHaveLength(10);
    expect(parsed.skipped).toBe(0);
    const byId = new Map(parsed.emails.map((e) => [e.id, e]));
    expect(byId.get("m01@acme.example")?.sender).toBe("customer@acme.example");
    expect(byId.get("m01@acme.example")?.subject).toBe("New order - PO #8834");
    // RFC 2047 encoded subject, decoded.
    expect(byId.get("m10@acme.example")?.subject).toBe("New order - PO #8836");
    // ">From " inside a body is unescaped back to "From ".
    expect(byId.get("m10@acme.example")?.body).toContain(
      "From the catalog, rush delivery.",
    );
  });

  it("the scout ranks the parsed inbox the same as the JSON fixture path", () => {
    const result = analyze(parseMbox(sampleMboxText()).emails);
    expect(result.emails_analyzed).toBe(10);
    const tasks = new Map(result.clusters.map((c) => [c.task, c]));
    expect(tasks.get("order_reentry")?.frequency).toBe(3);
    expect(tasks.get("status_chase")?.frequency).toBe(2);
    expect(tasks.get("invoice_mismatch")?.frequency).toBe(2);
    expect(tasks.get("proof_approval")?.frequency).toBe(1);
    expect(tasks.get("quote_request")?.frequency).toBe(1);
    expect(result.unclassified).toHaveLength(1);
    expect(result.top_opportunity?.task).toBe("order_reentry");
    expect(result.top_opportunity?.agent_prompt).toContain("ERP");
  });
});

describe("mbox splitting", () => {
  it("splits on From lines and ignores leading content", () => {
    const text =
      "not a message\n" +
      "From a@example.com Mon Oct 19 09:00:00 2026\n" +
      "Subject: One\n\nBody one\n" +
      "From b@example.com Mon Oct 19 09:01:00 2026\n" +
      "Subject: Two\n\nBody two\n";
    expect(splitMbox(text)).toHaveLength(2);
  });

  it("handles CRLF line endings", () => {
    const text =
      "From a@example.com Mon Oct 19 09:00:00 2026\r\n" +
      "Subject: One\r\n\r\nBody one\r\n";
    const parsed = parseMbox(text);
    expect(parsed.emails).toHaveLength(1);
    expect(parsed.emails[0].subject).toBe("One");
    expect(parsed.emails[0].body).toBe("Body one");
  });

  it("counts a message with no subject and no body as skipped", () => {
    const text =
      "From a@example.com Mon Oct 19 09:00:00 2026\n" +
      "From: a@example.com\n\n" +
      "From b@example.com Mon Oct 19 09:01:00 2026\n" +
      "Subject: Real\n\nBody\n";
    const parsed = parseMbox(text);
    expect(parsed.emails).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });

  it("counts an empty block between separators as a skipped message", () => {
    const text =
      "From a@example.com Mon Oct 19 09:00:00 2026\n" +
      "From b@example.com Mon Oct 19 09:01:00 2026\n" +
      "Subject: Real\n\nBody\n";
    const parsed = parseMbox(text);
    expect(parsed.emails).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });
});

describe("headers", () => {
  it("unfolds folded headers", () => {
    const raw =
      "From: a@example.com\n" +
      "Subject: a very long subject\n" +
      "  that continues here\n\n" +
      "Body\n";
    const parsed = parseMessage(raw, "x-1");
    expect(parsed?.subject).toBe("a very long subject that continues here");
  });

  it("decodes Q-encoded and B-encoded words", () => {
    expect(decodeHeader("=?UTF-8?Q?Quote_for_500_caps?=")).toBe(
      "Quote for 500 caps",
    );
    expect(decodeHeader("=?UTF-8?B?TmV3IG9yZGVy?=")).toBe("New order");
    expect(decodeHeader("plain subject")).toBe("plain subject");
  });

  it("joins adjacent encoded words with no space, per RFC 2047", () => {
    // "New order" split across two encoded words, as long non-ASCII
    // subjects arrive from Gmail.
    expect(
      decodeHeader("=?UTF-8?B?TmV3IA==?= =?UTF-8?B?b3JkZXI=?="),
    ).toBe("New order");
    expect(decodeHeader("Re: =?UTF-8?B?TmV3IA==?= =?UTF-8?B?b3JkZXI=?=")).toBe(
      "Re: New order",
    );
  });

  it("reads the sender address out of a display name", () => {
    const raw =
      'From: "Acme Apparel" <customer@acme.example>\n' +
      "Subject: Hi\n\nBody\n";
    expect(parseMessage(raw, "x-1")?.sender).toBe("customer@acme.example");
  });
});

describe("bodies", () => {
  it("decodes quoted-printable soft breaks and hex escapes to bytes", () => {
    expect(decodeQuotedPrintable("Hello=\nWorld")).toBe("HelloWorld");
    // Byte level: =C3 =A9 are the UTF-8 bytes for e-acute. The charset
    // step in decodeBodyText turns them into the character; here the
    // raw bytes come back as latin1 chars.
    expect(decodeQuotedPrintable("caf=C3=A9")).toBe(
      "caf" + String.fromCharCode(0xc3, 0xa9),
    );
  });

  it("prefers text/plain over text/html in multipart mail", () => {
    const plain = Buffer.from(
      "Please enter the order, PO number 9901.",
    ).toString("base64");
    const raw =
      "From: a@example.com\n" +
      "Subject: Order\n" +
      "Content-Type: multipart/alternative; boundary=BB\n\n" +
      "--BB\n" +
      "Content-Type: text/plain; charset=UTF-8\n" +
      "Content-Transfer-Encoding: base64\n\n" +
      plain +
      "\n--BB\n" +
      "Content-Type: text/html; charset=UTF-8\n\n" +
      "<p>Please enter the order, PO number 9901.</p>\n" +
      "--BB--\n";
    const parsed = parseMessage(raw, "x-1");
    expect(parsed?.body).toBe("Please enter the order, PO number 9901.");
  });

  it("splits multipart bodies when delimiter lines have trailing spaces", () => {
    const raw =
      "From: a@example.com\n" +
      "Subject: Order\n" +
      "Content-Type: multipart/alternative; boundary=BB\n\n" +
      "--BB \n" +
      "Content-Type: text/plain; charset=UTF-8\n\n" +
      "Please enter the order, PO number 9904.\n" +
      "--BB-- \n";
    const parsed = parseMessage(raw, "x-1");
    expect(parsed?.body).toBe("Please enter the order, PO number 9904.");
  });

  it("falls back to stripped html when there is no plain part", () => {    const raw =
      "From: a@example.com\n" +
      "Subject: Status\n" +
      "Content-Type: text/html; charset=UTF-8\n\n" +
      "<p>Where is order 123? <b>Has it shipped?</b></p>\n";
    const parsed = parseMessage(raw, "x-1");
    expect(parsed?.body).toBe("Where is order 123? Has it shipped?");
  });

  it("ignores attachments and keeps the message text", () => {
    const raw =
      "From: a@example.com\n" +
      "Subject: Order\n" +
      "Content-Type: multipart/mixed; boundary=MM\n\n" +
      "--MM\n" +
      "Content-Type: text/plain; charset=UTF-8\n\n" +
      "Please enter the order, PO number 9902.\n" +
      "--MM\n" +
      "Content-Type: application/pdf\n" +
      "Content-Disposition: attachment; filename=po.pdf\n" +
      "Content-Transfer-Encoding: base64\n\n" +
      "SlZGLWZh\na2U=\n" +
      "--MM--\n";
    const parsed = parseMessage(raw, "x-1");
    expect(parsed?.body).toBe("Please enter the order, PO number 9902.");
  });

  it("decodes quoted-printable bodies with a declared charset", () => {
    const raw =
      "From: a@example.com\n" +
      "Subject: Order\n" +
      "Content-Type: text/plain; charset=UTF-8\n" +
      "Content-Transfer-Encoding: quoted-printable\n\n" +
      "Please enter the order for caf=C3=A9 cups, PO number 9903.\n";
    const parsed = parseMessage(raw, "x-1");
    expect(parsed?.body).toBe(
      "Please enter the order for café cups, PO number 9903.",
    );
  });
});

describe("mailbox sniffing", () => {
  it("treats a leading From line as mbox and anything else as one message", () => {
    const mbox =
      "From a@example.com Mon Oct 19 09:00:00 2026\n" +
      "Subject: One\n\nBody one\n" +
      "From b@example.com Mon Oct 19 09:01:00 2026\n" +
      "Subject: Two\n\nBody two\n";
    expect(parseMailbox(mbox).emails).toHaveLength(2);

    const eml = "From: a@example.com\nSubject: Solo\n\nBody solo\n";
    const single = parseMailbox(eml);
    expect(single.emails).toHaveLength(1);
    expect(single.emails[0].subject).toBe("Solo");
  });
});
