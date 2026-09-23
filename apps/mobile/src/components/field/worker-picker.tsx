import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { CREW_PERMISSIONS, seesCrew } from "@cantero/shared";
import { fetchCached } from "@/lib/offline-cache";
import { Muted, ReadOnlyField, SelectField } from "./ui";

interface Worker {
  id: string;
  name: string;
  userId: string | null;
}

/**
 * Whose record a form is for. A member who may act for the crew (CREW_PERMISSIONS — the same table the
 * API's SelfScopeService enforces) picks anyone, starting on themselves; everyone else is fixed to the
 * employee record linked to their own account, so the phone never offers a choice the server refuses.
 */
export function useWorkerChoice({
  kind,
  meUserId,
  permissions,
  reloadKey,
}: {
  kind: keyof typeof CREW_PERMISSIONS;
  meUserId: string | null;
  permissions: readonly string[] | undefined;
  reloadKey: number;
}) {
  const crew = seesCrew(permissions, kind);
  const [all, setAll] = useState<Worker[] | null>(null);
  const [error, setError] = useState(false);
  const [workerId, setWorkerId] = useState("");

  useEffect(() => {
    fetchCached<Worker[]>("field:workers", "/workers")
      .then(({ data }) => setAll(data))
      .catch(() => setError(true));
  }, [reloadKey]);

  const choices = useMemo(() => (all === null ? [] : crew ? all : all.filter((w) => meUserId !== null && w.userId === meUserId)), [all, crew, meUserId]);

  // Start on the member's own record; drop a pick that is no longer offered (permissions changed).
  useEffect(() => {
    if (choices.some((w) => w.id === workerId)) return;
    const mine = choices.find((w) => w.userId === meUserId);
    setWorkerId((mine ?? choices[0])?.id ?? "");
  }, [choices, workerId, meUserId]);

  return { crew, choices, loaded: all !== null, error, workerId, setWorkerId };
}

export function WorkerPicker({ choice }: { choice: ReturnType<typeof useWorkerChoice> }) {
  const t = useTranslations("field");
  const tt = useTranslations("team");
  const { crew, choices, workerId, setWorkerId } = choice;

  if (choices.length === 0) return <Muted>{t(crew ? "noWorkers" : "noOwnWorker")}</Muted>;
  if (!crew) return <ReadOnlyField label={tt("worker")} value={choices[0].name} />;
  return <SelectField label={tt("worker")} value={workerId} options={choices.map((w) => ({ value: w.id, label: w.name }))} onChange={setWorkerId} />;
}
