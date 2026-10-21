import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/scout";
import { sampleEmails } from "@/lib/data";

describe("scout", () => {
  it("clusters and ranks by frequency times time", () => {
    const result = analyze(sampleEmails());
    expect(result.emails_analyzed).toBe(18);
    const tasks = new Map(result.clusters.map((c) => [c.task, c]));
    expect(tasks.get("order_reentry")?.frequency).toBe(6);
    expect(tasks.get("order_reentry")?.minutes_total).toBe(6 * 18);
    expect(tasks.get("status_chase")?.frequency).toBe(5);
    expect(tasks.get("invoice_mismatch")?.frequency).toBe(3);
    const scores = result.clusters.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("top opportunity has the Paul output shape", () => {
    const top = analyze(sampleEmails()).top_opportunity;
    expect(top?.task).toBe("order_reentry");
    expect(top?.reasoning).toContain("appears 6 times");
    expect(top?.agent_prompt).toBeTruthy();
    expect(top?.agent_prompt).toContain("ERP");
  });

  it("handles empty input", () => {
    const result = analyze([]);
    expect(result.emails_analyzed).toBe(0);
    expect(result.top_opportunity).toBeNull();
  });
});
