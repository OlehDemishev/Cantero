"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { EquipmentGpsPanel } from "@/components/equipment-gps-panel";
import { CalibrationPanel } from "@/components/calibration-panel";
import { EquipmentMaintenanceRecordsPanel } from "@/components/equipment-maintenance-records-panel";
import { EquipmentFuelLogsPanel } from "@/components/equipment-fuel-logs-panel";
import { EquipmentRentalHistoryPanel } from "@/components/equipment-rental-history-panel";
import { EquipmentAssignmentHistoryPanel } from "@/components/equipment-assignment-history-panel";
import { apiFetch } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/use-me";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import type { Equipment } from "@/components/equipment-detail/types";
import { ActionsCard } from "@/components/equipment-detail/actions-card";
import { MaintenanceScheduleCard } from "@/components/equipment-detail/maintenance-schedule-card";
import { DepreciationCard } from "@/components/equipment-detail/depreciation-card";

/** One piece of equipment; its own cards live in components/equipment-detail/ and share one busy flag and error notice. */
export default function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("equipment");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Equipment>(`/equipment/${id}`)
      .then((e) => {
        setLoadError(null);
        setEquipment(e);
      })
      .catch(setLoadError);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!equipment) {
    return loadError ? <ErrorState error={loadError} onRetry={load} backHref="/equipment" /> : <Skeleton variant="block" height="h-64" />;
  }

  const cardProps = { equipmentId: id, equipment, currency, busy, setBusy, setError, reload: load };

  return (
    <>
      <PageHeader
        title={equipment.name}
        description={
          <>
            {equipment.category}
            {equipment.serialNumber && ` · ${equipment.serialNumber}`}
          </>
        }
        actions={<Badge tone={statusTone(equipment.status)}>{t(`status_${equipment.status}`)}</Badge>}
      />
      {error && <Alert tone="danger" className="mt-4">{error}</Alert>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActionsCard {...cardProps} />

        <MaintenanceScheduleCard {...cardProps} />

        <DepreciationCard {...cardProps} />

        <EquipmentMaintenanceRecordsPanel equipmentId={id} currency={currency} />

        <CalibrationPanel equipmentId={id} />

        <EquipmentFuelLogsPanel equipmentId={id} currency={currency} />

        <EquipmentRentalHistoryPanel equipmentId={id} currency={currency} />

        <EquipmentGpsPanel equipmentId={id} />

        <EquipmentAssignmentHistoryPanel equipmentId={id} />
      </div>
    </>
  );
}
