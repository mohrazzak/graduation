"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { CornerTicks } from "@/components/ui/CornerTicks";
import type { DamageCode } from "@/lib/damage-classes";
import { artifactUrl, startMaskPreparation, startRepair } from "@/lib/jobs";
import { policyFor } from "@/lib/services";
import { ArtifactPersistenceNote } from "./ArtifactPersistenceNote";
import { BeforeAfter } from "./BeforeAfter";
import { MaskEditor, type MaskEditorHandle } from "./MaskEditor";
import { StageProgress } from "./StageProgress";
import { useArtifactPersistence } from "./useArtifactPersistence";
import { useJob } from "./useJob";
import type { SaveStatus } from "./useSaveAnalysis";

export interface RepairPanelProps {
  file: File;
  classCode: DamageCode;
  sourceSrc: string | null;
  analysisId: string | null;
  analysisStatus: SaveStatus;
  onRepaired: (jobId: string | null) => void;
}

const MASK_STAGES = ["isolating", "edges"] as const;
const REPAIR_STAGES = ["generating", "composing"] as const;

export function RepairPanel({ file, classCode, sourceSrc, analysisId, analysisStatus, onRepaired }: RepairPanelProps) {
  const t = useTranslations();
  const policy = policyFor(classCode);
  const preparation = useJob();
  const repair = useJob();
  const startPreparation = preparation.start;
  const editorRef = useRef<MaskEditorHandle>(null);
  const preparedFileRef = useRef<File | null>(null);
  const [hasSelection, setHasSelection] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);

  useEffect(() => {
    if (preparedFileRef.current === file) return;
    preparedFileRef.current = file;
    onRepaired(null);
    void startPreparation(() => startMaskPreparation(file));
  }, [file, onRepaired, startPreparation]);

  async function run(): Promise<void> {
    const mask = await editorRef.current?.exportMask();
    if (!mask || !editorRef.current?.hasSelection()) return;
    onRepaired(null);
    await repair.start(() => startRepair(file, mask, classCode, prompt.trim() || undefined));
  }

  const repaired = repair.state?.artifacts.includes("repaired") ?? false;
  const { status: artifactSaveStatus, retry: retryArtifactSave } = useArtifactPersistence({
    analysisId, analysisStatus, jobId: repair.jobId, ready: repaired, kind: "repaired",
  });

  useEffect(() => {
    if (repaired && repair.jobId !== null) onRepaired(repair.jobId);
  }, [repaired, repair.jobId, onRepaired]);

  const maskReady = preparation.jobId !== null && preparation.state?.status === "done" && preparation.state.artifacts.includes("mask") && sourceSrc !== null;

  return (
    <section className="relative overflow-hidden rounded border border-line bg-surface">
      <div className="relative p-5">
        <CornerTicks />
        <h3 className="font-display text-lg font-extrabold uppercase tracking-tight">{t("repair.title")}</h3>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">{t("repair.mask.intro")}</p>
        {policy.restoreWarns ? <p className="mt-3 rounded bg-hazard/10 p-3 text-sm text-hazard">{t("repair.gcWarning")}</p> : null}

        {preparation.state !== null ? (
          <div className="mt-4">
            <StageProgress stageKeys={MASK_STAGES} current={preparation.state.stage} status={preparation.state.status} timing={preparation.state.timing} service="repair" />
          </div>
        ) : null}

        {maskReady ? (
          <div className="mt-4 space-y-4">
            <MaskEditor ref={editorRef} sourceSrc={sourceSrc} maskSrc={artifactUrl(preparation.jobId!, "mask")} onSelectionChange={setHasSelection} />
            {!hasSelection ? <p role="alert" className="text-sm text-hazard">{t("repair.mask.empty")}</p> : null}
            <div className="flex flex-wrap gap-3">
              <Button disabled={!hasSelection || repair.running} onClick={() => void run()}>{t("repair.runSelection")}</Button>
              <Button variant="ghost" onClick={() => setEditingPrompt((open) => !open)}>{t("repair.editPrompt")}</Button>
            </div>
            {editingPrompt ? (
              <div>
                <label htmlFor="repair-prompt" className="block text-xs text-muted">{t("repair.promptLabel")}</label>
                <textarea id="repair-prompt" rows={4} value={prompt} placeholder={t("repair.promptPlaceholder")} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded border border-line bg-bg p-2 text-sm text-text" />
              </div>
            ) : null}
          </div>
        ) : null}

        {repair.state !== null ? (
          <div className="mt-5 space-y-4 border-t border-line pt-4">
            <StageProgress stageKeys={REPAIR_STAGES} current={repair.state.stage} status={repair.state.status} timing={repair.state.timing} service="repair" indefiniteKey="generating" />
            {repaired && repair.jobId && sourceSrc ? (
              <>
                <BeforeAfter baseSrc={sourceSrc} overlaySrc={artifactUrl(repair.jobId, "repaired")} overlayAlt={t("repair.repairedAlt")} />
                <ArtifactPersistenceNote status={artifactSaveStatus} onRetry={retryArtifactSave} />
              </>
            ) : null}
            {repair.state.status === "error" ? <p role="alert" className="text-sm text-hazard">{t(`repair.errors.${repair.state.detail ?? "server"}`)}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
