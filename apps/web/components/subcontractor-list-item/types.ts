import type { SubcontractorDiversityCategory, SubcontractorDocumentType } from "@cantero/shared";

export const DOCUMENT_TYPES: SubcontractorDocumentType[] = ["general_liability_insurance", "workers_comp_insurance", "license", "bonding", "other"];

export interface Subcontractor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  bio: string | null;
  publicListed: boolean;
  licenseNumber: string | null;
  bondingCapacity: string | null;
  safetyProgramSummary: string | null;
  diversityCertifications: SubcontractorDiversityCategory[];
  diversityCertificationExpiresAt: string | null;
}
export interface PerformanceReview {
  id: string;
  reviewedByName: string;
  rating: number;
  onTime: boolean | null;
  safetyIncidents: number;
  reworkCount: number;
  wouldHireAgain: boolean | null;
  comments: string | null;
  createdAt: string;
}
export interface Scorecard {
  reviewCount: number;
  averageRating: number | null;
  onTimePercent: number | null;
  wouldHireAgainPercent: number | null;
  totalSafetyIncidents: number;
  totalReworkCount: number;
}
export interface SubcontractorDocument {
  id: string;
  type: SubcontractorDocumentType;
  name: string;
  expiresAt: string;
}
export interface ComplianceRequirement {
  type: SubcontractorDocumentType;
  status: "missing" | "expired" | "valid";
  expiresAt: string | null;
}
export interface Compliance {
  compliant: boolean;
  requirements: ComplianceRequirement[];
}
export interface TaxProfile {
  taxId: string | null;
  legalBusinessName: string | null;
  mailingAddress: string | null;
  datevKreditorNumber: string | null;
}
export interface SubcontractorPayment {
  id: string;
  amount: string;
  paidAt: string;
  note: string | null;
}
export interface Assignment {
  id: string;
  startDate: string | null;
  endDate: string | null;
  actualEndDate: string | null;
  project: { id: string; name: string };
}
export interface SubcontractorCost {
  id: string;
  description: string;
  amount: string;
  incurredDate: string;
  paid: boolean;
  project: { id: string; name: string };
}

/** What every section of an opened row gets from the row. */
export interface SubcontractorSectionProps {
  subcontractor: Subcontractor;
  /** One save at a time per row: every action in it is disabled while one runs. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** Bumped by `refresh`: each section loads what it shows again when it moves. */
  version: number;
  /** After a change in the open row: everything it shows again. */
  refresh: () => void;
  /** Tells the list a save may have changed how the row looks. */
  onChanged: () => void;
}
