import type { DepreciationMethod, EquipmentStatus } from "@cantero/shared";

export interface Project {
  id: string;
  name: string;
}
export interface Worker {
  id: string;
  name: string;
}
export interface AssignmentSummary {
  project: { id: string; name: string } | null;
  worker: { id: string; name: string } | null;
}
export interface DepreciationResult {
  monthsElapsed: number;
  accumulatedDepreciation: number;
  bookValue: number;
}
export interface AssetDisposal {
  id: string;
  disposedAt: string;
  saleAmount: string | null;
  notes: string | null;
}
export interface Equipment {
  id: string;
  name: string;
  category: string;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: string | null;
  status: EquipmentStatus;
  notes: string | null;
  assignments: AssignmentSummary[];
  maintenanceIntervalDays: number | null;
  nextMaintenanceDueAt: string | null;
  currentMeterHours: string | null;
  maintenanceIntervalHours: string | null;
  nextMaintenanceDueHours: string | null;
  depreciationMethod: DepreciationMethod | null;
  usefulLifeMonths: number | null;
  salvageValue: string | null;
  depreciation: DepreciationResult | null;
  disposal: AssetDisposal | null;
}
export interface Rental {
  id: string;
  renterName: string;
  renterContact: string | null;
  dailyRate: string;
  startDate: string;
  expectedReturnDate: string | null;
  actualReturnDate: string | null;
  notes: string | null;
  daysElapsed: number;
  revenue: number;
}

/** What each card of the equipment page gets from it. */
export interface EquipmentCardProps {
  equipmentId: string;
  equipment: Equipment;
  currency: string;
  /** One change at a time on the page: every save is disabled while one runs. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** Shows (or, with null, clears) the page's error notice. */
  setError: (error: string | null) => void;
  /** Loads the equipment again after a change. */
  reload: () => void;
}
