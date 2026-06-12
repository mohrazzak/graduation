"use client";
// Demo-day samples: six thumbnails whose exact bytes were pre-verified (by
// web/scripts/make_samples.py) to classify as their labeled level in the mock.
import Image from "next/image";
import { useTranslations } from "next-intl";
import { DAMAGE_LEVELS, type DamageLevelId } from "@/lib/levels";

export interface SampleStripProps {
  onSample: (file: File) => void;
  disabled?: boolean;
}

const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 72;

export function SampleStrip({ onSample, disabled = false }: SampleStripProps) {
  const t = useTranslations();

  async function pick(id: DamageLevelId): Promise<void> {
    const name = `level-${id}.jpg`;
    try {
      // Fetch the verified bytes and hand them over as a regular File so the
      // sample path and the upload path share one submit pipeline.
      const blob = await (await fetch(`/samples/${name}`)).blob();
      onSample(new File([blob], name, { type: "image/jpeg" }));
    } catch {
      // Same-origin static asset: failing here means the app itself is
      // offline, where every surface already fails visibly.
    }
  }

  return (
    <section>
      <h2 className="font-display text-sm font-bold uppercase tracking-wider">
        {t("analyze.samplesTitle")}
      </h2>
      <p className="mt-1 text-xs text-muted">{t("analyze.samplesHint")}</p>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {DAMAGE_LEVELS.map((level) => (
          <li key={level.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void pick(level.id)}
              className="block w-full rounded border border-line transition-colors duration-150 hover:border-hazard disabled:pointer-events-none disabled:opacity-40"
            >
              <Image
                src={`/samples/level-${level.id}.jpg`}
                alt={t(`levels.${level.key}.name`)}
                width={THUMB_WIDTH}
                height={THUMB_HEIGHT}
                className="block h-auto w-full"
              />
              <span className="block py-1 text-center font-mono text-[10px] text-muted">
                {t("common.levelDigit", { id: String(level.id) })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
