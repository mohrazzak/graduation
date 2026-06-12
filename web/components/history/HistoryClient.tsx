"use client";
// History orchestrator: loads the saved analyses + signed thumbnail URLs, then
// drives loading/error/empty/grid states, the detail modal, delete, and toast.
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Toast } from "@/components/ui/Toast";
import { deleteAnalysis, getSignedUrl, listAnalyses } from "@/lib/supabase/queries";
import type { Analysis } from "@/lib/types";
import { AnalysisModal } from "./AnalysisModal";
import { EmptyState } from "./EmptyState";
import { HistoryGrid } from "./HistoryGrid";
import { HistoryStats } from "./HistoryStats";

type LoadState = "loading" | "error" | "ready";
type UrlMap = Record<string, string | null>;

type HistoryLoad =
  | { ok: true; analyses: Analysis[]; imageUrls: UrlMap }
  | { ok: false; errorKey: "loadFailed" | "notConfigured" };

// Module scope (no setState) so the mount effect only subscribes to the result
// via a callback — the pattern the react-hooks/set-state-in-effect lint allows.
async function fetchHistory(): Promise<HistoryLoad> {
  const { data, error } = await listAnalyses();
  if (error !== null || data === null) {
    return { ok: false, errorKey: error === "not_configured" ? "notConfigured" : "loadFailed" };
  }
  // Sign all visible thumbnails in parallel; a per-item url_failed becomes a
  // null entry (placeholder card) instead of sinking the whole page.
  const entries = await Promise.all(
    data.map(async (analysis) => {
      const url = await getSignedUrl(analysis.image_path);
      return [analysis.id, url.data] as const;
    }),
  );
  return { ok: true, analyses: data, imageUrls: Object.fromEntries(entries) };
}

export function HistoryClient() {
  const t = useTranslations();
  const [state, setState] = useState<LoadState>("loading");
  const [loadErrorKey, setLoadErrorKey] = useState<"loadFailed" | "notConfigured">("loadFailed");
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [imageUrls, setImageUrls] = useState<UrlMap>({});
  const [heatmapUrls, setHeatmapUrls] = useState<UrlMap>({});
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [deletedToast, setDeletedToast] = useState(false);

  const applyLoad = useCallback((result: HistoryLoad) => {
    if (!result.ok) {
      setLoadErrorKey(result.errorKey);
      setState("error");
      return;
    }
    setAnalyses(result.analyses);
    setImageUrls(result.imageUrls);
    setState("ready");
  }, []);

  useEffect(() => {
    void fetchHistory().then(applyLoad);
  }, [applyLoad]);

  const retry = useCallback(() => {
    setState("loading");
    void fetchHistory().then(applyLoad);
  }, [applyLoad]);

  const open = useCallback(
    (analysis: Analysis) => {
      setSelected(analysis);
      // Heatmap URLs are signed lazily — only an opened analysis needs one —
      // and cached per id so reopening costs nothing and late results cannot
      // attach to the wrong analysis. Only SUCCESSFUL URLs are cached: a
      // transient signing failure re-signs on the next open instead of
      // disabling the heatmap toggle for the rest of the session.
      if (analysis.heatmap_path !== null && heatmapUrls[analysis.id] === undefined) {
        const path = analysis.heatmap_path;
        void getSignedUrl(path).then(({ data }) => {
          if (data !== null) {
            setHeatmapUrls((urls) => ({ ...urls, [analysis.id]: data }));
          }
        });
      }
    },
    [heatmapUrls],
  );

  const handleDelete = useCallback(async (): Promise<boolean> => {
    if (selected === null) return false;
    const { error } = await deleteAnalysis(selected);
    if (error !== null) return false;
    setAnalyses((list) => list.filter((item) => item.id !== selected.id));
    setSelected(null);
    setDeletedToast(true);
    return true;
  }, [selected]);

  const dismissDeletedToast = useCallback(() => setDeletedToast(false), []);

  return (
    <div>
      {state === "loading" ? (
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-muted">
          <Spinner />
          <span role="status">{t("history.loading")}</span>
        </div>
      ) : null}
      {state === "error" ? (
        // Hazard, not alert: #FF3B30 is reserved for level-4/5 surfaces (spec section 8).
        <div role="alert" className="rounded border border-hazard/40 bg-hazard/10 p-5">
          <p className="text-sm text-hazard">{t(`history.${loadErrorKey}`)}</p>
          <Button variant="primary" className="mt-4" onClick={retry}>
            {t("common.actions.retry")}
          </Button>
        </div>
      ) : null}
      {state === "ready" ? (
        analyses.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <HistoryStats analyses={analyses} />
            <HistoryGrid analyses={analyses} imageUrls={imageUrls} onOpen={open} />
          </>
        )
      ) : null}
      {selected !== null ? (
        <AnalysisModal
          analysis={selected}
          imageUrl={imageUrls[selected.id] ?? null}
          heatmapUrl={heatmapUrls[selected.id] ?? null}
          onDelete={handleDelete}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {deletedToast ? (
        <Toast message={t("history.deleted")} onDismiss={dismissDeletedToast} />
      ) : null}
    </div>
  );
}
