export interface RateCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  formula: string | null;
  formulaParams: string[];
}
export interface EstimateLine {
  id: string;
  rateCatalogItemId: string;
  quantity: string;
  materialsCost: string;
  laborCost: string;
  lineTotal: string;
}
export interface LineBenchmark {
  estimateLineId: string;
  benchmarkMedian: number;
  benchmarkSampleSize: number;
  deviationPercent: number;
}
export const BENCHMARK_FLAG_THRESHOLD = 15;
export interface Requirement {
  id: string;
  quantity: string;
  unit: string;
  materialCatalogItem: { name: string; code: string };
}
export interface Warehouse {
  id: string;
  name: string;
}
export interface IssueReportLine {
  materialCatalogItemId: string;
  name: string;
  required: number;
  remainingStock: number;
}
export type ClientDecision = "pending" | "approved" | "rejected" | "countered";
export type EstimateStatus = "draft" | "pending_approval" | "approved";
export interface EstimateApproval {
  id: string;
  userId: string;
  actorName: string;
  approvedAt: string;
}
export interface Estimate {
  id: string;
  name: string;
  status: EstimateStatus;
  laborRatePerHour: string;
  markupPercent: string;
  taxPercent: string;
  materialsCostTotal: string;
  laborCostTotal: string;
  subtotal: string;
  markupAmount: string;
  taxAmount: string;
  grandTotal: string;
  currency: string;
  currentVersion: number;
  isStale: boolean;
  lines: EstimateLine[];
  requirements: Requirement[];
  project: { id: string; name: string };
  clientDecision: ClientDecision;
  sentAt: string | null;
  decisionAt: string | null;
  clientDecisionNote: string | null;
  counterOfferAmount: string | null;
  variantOfId: string | null;
  variantLabel: string | null;
  coverLetter: string | null;
  signerName: string | null;
  approvals: EstimateApproval[];
}

/** What the sections of the estimate page get from it. */
export interface EstimateSectionProps {
  estimateId: string;
  estimate: Estimate;
  currency: string;
  /** One change at a time on the page: every action is disabled while one runs. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** Loads the estimate again after a change. */
  reload: () => void;
}
