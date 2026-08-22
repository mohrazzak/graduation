"use client";
// What to do next with this building, gated by tier.
//
//   NC  restoration is hidden with a reason (nothing to rebuild) and 3D leads
//   PC  the full pipeline, restoration already open
//   GC  restoration offered but warned inside the panel
//
// Nothing here exists before a verdict: restoration is gated on classification,
// which the API enforces independently.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { policyFor } from "@/lib/services";
import type { DamageCode } from "@/lib/damage-classes";
import { ModelPanel } from "./ModelPanel";
import { RepairPanel } from "./RepairPanel";
import type { SaveStatus } from "./useSaveAnalysis";

export interface ServiceRailProps {
  file: File;
  classCode: DamageCode;
  sourceSrc: string | null;
  /** Row generated artifacts attach to; null until the analysis has saved. */
  analysisId: string | null;
  /** Base analysis save lifecycle, shared with generated-artifact saves. */
  analysisStatus: SaveStatus;
}

export function ServiceRail({
  file,
  classCode,
  sourceSrc,
  analysisId,
  analysisStatus,
}: ServiceRailProps) {
  const t = useTranslations();
  const policy = policyFor(classCode);
  const [repairedJobId, setRepairedJobId] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(policy.restorePreselected);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted">
        {t("services.title")}
      </h2>

      {policy.canRestore ? (
        restoreOpen ? (
          <RepairPanel
            file={file}
            classCode={classCode}
            sourceSrc={sourceSrc}
            analysisId={analysisId}
            analysisStatus={analysisStatus}
            onRepaired={setRepairedJobId}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRestoreOpen(true)}
            className="w-full rounded border border-line bg-surface p-4 text-start transition-colors duration-150 hover:border-hazard"
          >
            <span className="block font-display text-base font-bold uppercase">
              {t("repair.title")}
            </span>
            <span className="mt-1 block text-sm text-muted">{t("repair.intro")}</span>
            {/* The caveat belongs BEFORE the decision to open, not just before
                the decision to run — at total collapse it is the whole point. */}
            {policy.restoreWarns ? (
              <span className="mt-2 block border-s-2 border-hazard ps-3 text-sm text-hazard">
                {t("repair.gcWarning")}
              </span>
            ) : null}
          </button>
        )
      ) : (
        // Not hidden silently: an unavailable action with no explanation reads
        // as a missing feature rather than a deliberate rule.
        <p className="rounded border border-line bg-surface p-4 text-sm text-muted">
          {t("repair.notNeeded")}
        </p>
      )}

      <ModelPanel
        file={file}
        analysisId={analysisId}
        analysisStatus={analysisStatus}
        repairedJobId={repairedJobId}
        primary={policy.model3dPrimary}
      />
    </div>
  );
}
