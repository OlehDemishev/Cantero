import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { fetchCached } from "@/lib/offline-cache";
import { submitOrQueue } from "@/lib/offline-queue";
import {
  Card,
  Field,
  FieldMessage,
  Loading,
  Muted,
  parseDecimal,
  PrimaryButton,
  SelectField,
  TextField,
  type FieldMessageType,
} from "./ui";

interface Warehouse {
  id: string;
  name: string;
}
interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}

type MovementType = "issue" | "receipt";

export function StockTab({ projectId, reloadKey }: { projectId: string; reloadKey: number }) {
  const t = useTranslations("field");
  const tw = useTranslations("warehouses");
  const tc = useTranslations("common");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [form, setForm] = useState({
    warehouseId: "",
    materialCatalogItemId: "",
    quantity: "1",
    type: "issue" as MovementType,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCached<Warehouse[]>("field:warehouses", "/materials/warehouses")
      .then(({ data: list }) => {
        setWarehouses(list);
        setForm((f) => ({ ...f, warehouseId: f.warehouseId || (list[0]?.id ?? "") }));
      })
      .catch(() => setError(true));
    fetchCached<MaterialCatalogItem[]>("field:materials", "/materials/catalog")
      .then(({ data: list }) => {
        setMaterials(list);
        setForm((f) => ({ ...f, materialCatalogItemId: f.materialCatalogItemId || (list[0]?.id ?? "") }));
      })
      .catch(() => setError(true));
  }, [reloadKey]);

  async function submit() {
    if (!form.warehouseId || !form.materialCatalogItemId) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued } = await submitOrQueue("stock-movement", "/materials/stock/movements", "POST", {
        warehouseId: form.warehouseId,
        materialCatalogItemId: form.materialCatalogItemId,
        type: form.type,
        quantity: parseDecimal(form.quantity),
        projectId,
      });
      setMessage({ type: "success", text: queued ? t("queuedOffline") : tc("saved") });
      setForm((f) => ({ ...f, quantity: "1" }));
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Muted>{t("offline")}</Muted>;
  if (warehouses.length === 0 || materials.length === 0) return <Loading />;

  return (
    <Card>
      <SelectField
        label={tw("title")}
        value={form.warehouseId}
        options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
        onChange={(warehouseId) => setForm((f) => ({ ...f, warehouseId }))}
      />
      <SelectField
        label={tw("material")}
        value={form.materialCatalogItemId}
        options={materials.map((m) => ({ value: m.id, label: `${m.code} — ${m.name} (${m.unit})` }))}
        onChange={(materialCatalogItemId) => setForm((f) => ({ ...f, materialCatalogItemId }))}
      />
      <SelectField<MovementType>
        label={tw("type")}
        value={form.type}
        options={[
          { value: "issue", label: tw("issue") },
          { value: "receipt", label: tw("receipt") },
        ]}
        onChange={(type) => setForm((f) => ({ ...f, type }))}
      />
      <Field label={t("quantity")}>
        <TextField
          keyboardType="decimal-pad"
          value={form.quantity}
          onChangeText={(quantity) => setForm((f) => ({ ...f, quantity }))}
        />
      </Field>
      <PrimaryButton label={t("issueStockButton")} onPress={submit} busy={busy} disabled={!form.quantity.trim()} />
      {message && <FieldMessage type={message.type} text={message.text} />}
    </Card>
  );
}
