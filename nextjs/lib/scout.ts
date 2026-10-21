import type { EmailMessage, ScoutCluster, ScoutResult } from "./types";

// Automation Scout, a deterministic "Paul-lite".
//
// Trelium's Paul watches how work moves and returns the opportunity, the
// reasoning, and a ready-made prompt to build the agent. This does the
// same over an email export, with keyword clustering instead of an LLM,
// so it runs with no API key. An LLM could polish the wording later.
// It should never decide the ranking.

interface Category {
  keywords: string[];
  minutes: number;
  agent: string;
}

const CATEGORIES: Record<string, Category> = {
  order_reentry: {
    keywords: [
      "purchase order",
      "po #",
      "po number",
      "enter the order",
      "re-enter",
      "order entry",
      "new order",
    ],
    minutes: 18,
    agent:
      "When a purchase order arrives by email, extract the customer, line " +
      "items, quantities, prices and delivery date. Create the order in " +
      "the ERP, then reply to the customer confirming the order number. " +
      "If any field is missing or unreadable, ask for only that field and " +
      "do not create the order.",
  },
  status_chase: {
    keywords: [
      "where is",
      "status of",
      "tracking",
      "eta",
      "has it shipped",
      "any update",
      "delivery date",
    ],
    minutes: 7,
    agent:
      "When a customer asks for an order status, find the order in the ERP, " +
      "read its current production and shipping status, and reply with the " +
      "status, the expected delivery date, and the tracking link if it has " +
      "shipped. Never guess a date that is not in the ERP.",
  },
  invoice_mismatch: {
    keywords: [
      "invoice",
      "freight",
      "billing",
      "overcharged",
      "discrepancy",
      "doesn't match",
      "does not match",
    ],
    minutes: 22,
    agent:
      "When a vendor invoice arrives, match it against the purchase order " +
      "line by line: quantities, unit prices, freight and setup fees. If " +
      "everything matches, mark it ready to pay. If anything differs, " +
      "produce an exception report showing both values and the delta, and " +
      "wait for a human to approve or reject it before paying.",
  },
  proof_approval: {
    keywords: ["proof", "mockup", "artwork", "approve the design", "pre-production"],
    minutes: 11,
    agent:
      "When artwork is ready, generate a proof from the order's artwork file, " +
      "send it to the customer for approval, and log the reply. If approved, " +
      "move the order to production. If changes are requested, route the " +
      "comments back to the design team with the order number attached.",
  },
  quote_request: {
    keywords: ["quote", "quotation", "how much", "pricing for", "price for"],
    minutes: 15,
    agent:
      "When a quote is requested, read the product, quantity and decoration " +
      "method, look up pricing in the catalog, and draft a quote email. " +
      "Show the draft to a human before sending if the total is above the " +
      "configured threshold.",
  },
};

function classify(email: EmailMessage): string | null {
  const text = `${email.subject ?? ""} ${email.body ?? ""}`.toLowerCase();
  let best: string | null = null;
  let bestHits = 0;
  for (const [name, cfg] of Object.entries(CATEGORIES)) {
    const hits = cfg.keywords.filter((kw) => text.includes(kw)).length;
    if (hits > bestHits) {
      best = name;
      bestHits = hits;
    }
  }
  return best;
}

export function analyze(emails: EmailMessage[]): ScoutResult {
  const buckets = new Map<string, string[]>();
  const unclassified: string[] = [];
  for (const e of emails) {
    const cat = classify(e);
    if (cat) {
      const ids = buckets.get(cat) ?? [];
      ids.push(e.id);
      buckets.set(cat, ids);
    } else {
      unclassified.push(e.id);
    }
  }

  const clusters: ScoutCluster[] = [];
  for (const [name, ids] of buckets.entries()) {
    const cfg = CATEGORIES[name];
    const freq = ids.length;
    clusters.push({
      task: name,
      frequency: freq,
      minutes_per_occurrence: cfg.minutes,
      minutes_total: freq * cfg.minutes,
      score: freq * cfg.minutes, // frequency x time, the ranking rule
      email_ids: ids,
    });
  }
  clusters.sort((a, b) => b.score - a.score);

  let top = null;
  if (clusters.length > 0) {
    const best = clusters[0];
    top = {
      task: best.task,
      reasoning:
        `'${best.task}' appears ${best.frequency} times in this export ` +
        `and takes ~${best.minutes_per_occurrence} min each by hand, ` +
        `${best.minutes_total} min total, the highest frequency x time ` +
        `score (${best.score}) of any repetitive task found. It follows ` +
        "the same steps every time and its inputs already arrive by email, " +
        "so it can be automated without changing how anyone works.",
      agent_prompt: CATEGORIES[best.task].agent,
    };
  }

  return {
    emails_analyzed: emails.length,
    unclassified,
    clusters,
    top_opportunity: top,
  };
}
