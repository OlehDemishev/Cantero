"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";

/** Autodesk Viewer v7, served by Autodesk (it isn't distributed on npm). Both origins are allowed
 * in next.config.ts's CSP. */
const VIEWER_BASE = "https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*";

interface ViewerToken {
  accessToken: string;
  expiresIn: number;
  api: string;
}

// The slice of the Viewer's global API this component uses (there's no maintained type package).
interface ViewerDocument {
  getRoot(): { getDefaultGeometry(): unknown };
}
interface GuiViewer {
  start(): number;
  finish(): void;
  setTheme(theme: "light-theme" | "dark-theme"): void;
  loadDocumentNode(doc: ViewerDocument, node: unknown): Promise<unknown>;
}
interface ViewingNamespace {
  Initializer(options: { env: string; api: string; getAccessToken: (done: (token: string, expiresIn: number) => void) => void; language?: string }, onReady: () => void): void;
  GuiViewer3D: new (container: HTMLElement) => GuiViewer;
  Document: { load(urn: string, onSuccess: (doc: ViewerDocument) => void, onFailure: (code: number, message: string) => void): void };
  ErrorCodes: Record<string, number>;
}
declare global {
  interface Window {
    Autodesk?: { Viewing: ViewingNamespace };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadViewerScript(): Promise<void> {
  if (window.Autodesk?.Viewing) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${VIEWER_BASE}/style.min.css`;
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = `${VIEWER_BASE}/viewer3D.min.js`;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("script"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** The Viewer's Initializer is global and runs once per page, with the region endpoint of the
 * first token it saw. A company's hub lives in one region, so that's the same for every model. */
let initPromise: Promise<void> | null = null;

/** Autodesk.Viewing.ErrorCodes names meaning "no viewable derivatives (yet)" or "this Autodesk
 * user can't see it", as opposed to a real failure. */
const NOT_VIEWABLE = ["BAD_DATA_NO_VIEWABLE_CONTENT", "NETWORK_FILE_NOT_FOUND", "BAD_DATA_MODEL_IS_EMPTY"];
const NO_ACCESS = ["NETWORK_ACCESS_DENIED"];

/** Streams one ACC model into Autodesk's own 3D/2D viewer. The browser only ever holds a
 * viewables:read token from GET /projects/:id/autodesk/viewer-token — see AutodeskService. */
export function AutodeskViewer({ projectId, urn, language }: { projectId: string; urn: string; language?: string }) {
  const t = useTranslations("bim");
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let viewer: GuiViewer | null = null;
    let cancelled = false;
    resetStateInEffect(() => {
      setError(null);
      setLoading(true);
    });

    const fetchToken = () => apiFetch<ViewerToken>(`/projects/${projectId}/autodesk/viewer-token`);

    (async () => {
      const first = await fetchToken();
      await loadViewerScript().catch(() => {
        throw new Error(t("viewerScriptFailed"));
      });
      const Viewing = window.Autodesk!.Viewing;
      let pending: ViewerToken | null = first;
      initPromise ??= new Promise<void>((resolve) =>
        Viewing.Initializer(
          {
            env: "AutodeskProduction",
            api: first.api,
            language,
            // Called again by the Viewer before the previous token expires.
            getAccessToken: (done) => {
              const next = pending;
              pending = null;
              (next ? Promise.resolve(next) : fetchToken()).then((tok) => done(tok.accessToken, tok.expiresIn)).catch(() => undefined);
            },
          },
          resolve,
        ),
      );
      await initPromise;
      if (cancelled || !container.current) return;

      viewer = new Viewing.GuiViewer3D(container.current);
      viewer.start();
      viewer.setTheme(document.documentElement.classList.contains("dark") ? "dark-theme" : "light-theme");
      const doc = await new Promise<ViewerDocument>((resolve, reject) =>
        Viewing.Document.load(`urn:${urn}`, resolve, (code) => {
          const is = (names: string[]) => names.some((n) => Viewing.ErrorCodes?.[n] === code);
          reject(new Error(is(NOT_VIEWABLE) ? t("notViewable") : is(NO_ACCESS) ? t("noAccess") : t("loadFailed", { code })));
        }),
      );
      if (cancelled || !viewer) return;
      await viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
    })()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("loadFailed", { code: "?" }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      viewer?.finish();
      viewer = null;
    };
  }, [projectId, urn, language, t]);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      <div ref={container} className="absolute inset-0" />
      {loading && !error && <p className="absolute left-3 top-3 text-xs text-gray-500 dark:text-gray-400">{t("loading")}</p>}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md text-sm text-error-600">{error}</p>
        </div>
      )}
    </div>
  );
}
