import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/scout/ingest/route";

function mailboxForm(): FormData {
  const text = readFileSync(
    path.join(process.cwd(), "data", "sample_inbox.mbox"),
    "utf-8",
  );
  const form = new FormData();
  form.append("file", new File([text], "inbox.mbox", { type: "text/plain" }));
  return form;
}

describe("POST /api/scout/ingest", () => {
  it("analyzes an uploaded mbox file", async () => {
    const req = new Request("http://localhost/api/scout/ingest", {
      method: "POST",
      body: mailboxForm(),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      emails_analyzed: number;
      parsed: { messages: number; skipped: number };
      top_opportunity: { task: string } | null;
    };
    expect(body.emails_analyzed).toBe(10);
    expect(body.parsed).toEqual({ messages: 10, skipped: 0 });
    expect(body.top_opportunity?.task).toBe("order_reentry");
  });

  it("rejects a missing file", async () => {
    const req = new Request("http://localhost/api/scout/ingest", {
      method: "POST",
      body: new FormData(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects a file with no readable messages", async () => {
    const form = new FormData();
    form.append("file", new File(["hello, not mail"], "x.txt"));
    const req = new Request("http://localhost/api/scout/ingest", {
      method: "POST",
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects a file over the size limit", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File(["x".repeat(26 * 1024 * 1024)], "big.mbox"),
    );
    const req = new Request("http://localhost/api/scout/ingest", {
      method: "POST",
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
