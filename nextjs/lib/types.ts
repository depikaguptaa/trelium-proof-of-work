export interface EmailMessage {
  id: string;
  subject?: string;
  body?: string;
  sender?: string;
}

export interface ScoutCluster {
  task: string;
  frequency: number;
  minutes_per_occurrence: number;
  minutes_total: number;
  score: number;
  email_ids: string[];
}

export interface TopOpportunity {
  task: string;
  reasoning: string;
  agent_prompt: string;
}

export interface ScoutResult {
  emails_analyzed: number;
  unclassified: string[];
  clusters: ScoutCluster[];
  top_opportunity: TopOpportunity | null;
}

export interface LineItem {
  sku: string;
  description?: string;
  qty: number;
  unit_price: number;
}

export interface MatchDocument {
  doc_id: string;
  line_items: LineItem[];
  freight: number;
  setup_fee: number;
}

export interface Mismatch {
  field: string;
  sku: string | null;
  po_value: number;
  invoice_value: number;
  delta: number;
  severity: "high" | "medium";
}

export interface ApprovalState {
  state: string;
  approver: string | null;
  note: string;
}

export interface MatchReportData {
  report_id: string;
  po_id: string;
  invoice_id: string;
  status: "MATCH" | "EXCEPTION";
  fields_checked: string[];
  mismatch_count: number;
  mismatches: Mismatch[];
  total_delta: number;
  approval: ApprovalState;
}

export interface CrmEntry {
  system: string;
  event: string;
  report_id: string;
  decision: string;
  approver: string;
  note: string;
  match_status: string;
  mismatch_count: number;
}

export interface ApprovalRequestBody {
  report_id: string;
  decision: string;
  approver?: string;
  note?: string;
}
