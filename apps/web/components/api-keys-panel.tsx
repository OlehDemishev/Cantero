"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { API_KEY_SCOPES, type ApiKeyScope } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function ApiKeysPanel() {
  const t = useTranslations("settings");
  const confirm = useConfirm();
  const tc = useTranslations("common");
  // Dataset scopes read as their /v1 path; SCIM is a different kind of access, so it gets a name.
  const scopeLabel = (scope: string) => (scope === "scim" ? t("apiKeyScopeScim") : scope);
  const { data: apiKeys = null, reload: reloadApiKeys } = useApi<ApiKey[]>("/company/api-keys");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<ApiKeyScope[]>([]);
  const [newKeyExpiresAt, setNewKeyExpiresAt] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadApiKeys();
  }

  async function createApiKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setKeyCopied(false);
    try {
      const created = await apiFetch<{ key: string }>("/company/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: newKeyName,
          scopes: newKeyScopes.length > 0 ? newKeyScopes : undefined,
          expiresAt: newKeyExpiresAt ? new Date(newKeyExpiresAt).toISOString() : undefined,
        }),
      });
      setCreatedKey(created.key);
      setNewKeyName("");
      setNewKeyScopes([]);
      setNewKeyExpiresAt("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function copyApiKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setKeyCopied(true);
  }

  async function revokeApiKey(id: string) {
    if (!(await confirm({ message: t("confirmRevokeApiKey"), tone: "danger", verb: "revoke" }))) return;
    await apiFetch(`/company/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section id="api-keys" className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("apiKeys")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("apiKeysHint")}</p>

      {createdKey && (
        <Alert tone="warning" className="mb-4">
          <p className="text-xs text-warning-fg">{t("apiKeyShownOnce")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white dark:bg-gray-800 px-2 py-1 text-xs">{createdKey}</code>
            <button onClick={copyApiKey} className="btn-secondary shrink-0 px-3 py-1 text-xs">
              {keyCopied ? tc("saved") : t("copyKey")}
            </button>
          </div>
        </Alert>
      )}

      {!apiKeys || apiKeys.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noApiKeys")}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
              <th className="py-2">{tc("name")}</th>
              <th>{t("apiKeyPrefix")}</th>
              <th>{t("apiKeyScopes")}</th>
              <th>{t("apiKeyExpires")}</th>
              <th>{t("apiKeyLastUsed")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((k) => (
              <tr key={k.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2">{k.name}</td>
                <td className="font-mono text-xs text-fg-subtle">{k.keyPrefix}…</td>
                <td className="text-xs text-fg-subtle">{k.scopes.length > 0 ? k.scopes.map(scopeLabel).join(", ") : t("apiKeyUnrestricted")}</td>
                <td className="text-xs text-fg-subtle">{k.expiresAt ? formatDate(new Date(k.expiresAt)) : "—"}</td>
                <td className="text-xs text-fg-subtle">
                  {k.revokedAt
                    ? t("apiKeyRevoked")
                    : k.lastUsedAt
                      ? formatDate(new Date(k.lastUsedAt))
                      : t("apiKeyNeverUsed")}
                </td>
                <td>
                  {!k.revokedAt && (
                    <button onClick={() => revokeApiKey(k.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("revoke")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <form onSubmit={createApiKey} className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            placeholder={t("apiKeyNamePlaceholder")}
            className="input"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
          />
          <Field label={t("apiKeyExpires")} size="sm">
            <input
              type="date"
              className="input"
              value={newKeyExpiresAt}
              onChange={(e) => setNewKeyExpiresAt(e.target.value)}
            />
          </Field>
          <button type="submit" disabled={busy} className="btn-primary shrink-0">
            {t("createApiKey")}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-fg-subtle">{t("apiKeyScopesHint")}</span>
          {API_KEY_SCOPES.map((scope) => (
            <label
              key={scope}
              className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-xs ${
                newKeyScopes.includes(scope) ? "border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={newKeyScopes.includes(scope)}
                onChange={() =>
                  setNewKeyScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]))
                }
              />
              {scopeLabel(scope)}
            </label>
          ))}
        </div>
      </form>
    </section>
  );
}
