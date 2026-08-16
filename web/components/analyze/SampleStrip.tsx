"use client";
// Demo-day samples: one thumbnail per tier, so the strip demonstrates the
// actual scale the model predicts over.
import Image from "next/image";
import { useTranslations } from "next-intl";
import { DAMAGE_TIERS, type TierCode } from "@/lib/tiers";

export interface SampleStripProps {
  onSample: (file: File) => void;
  disabled?: boolean;
}

const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 72;

export function SampleStrip({ onSample, disabled = false }: SampleStripProps) {
  const t = useTranslations();

  async function pick(code: TierCode): Promise<void> {
    const name = `sample-${code}.jpg`;
    try {
      // Fetch the bytes and hand them over as a regular File so the sample
      // path and the upload path share one submit pipeline.
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
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {DAMAGE_TIERS.map((tier) => (
          <li key={tier.code}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void pick(tier.code)}
              className="block w-full rounded border border-line transition-colors duration-150 hover:border-hazard disabled:pointer-events-none disabled:opacity-40"
            >
              <Image
                src={`/samples/sample-${tier.code}.jpg`}
                alt={t(`tiers.${tier.key}.name`)}
                width={THUMB_WIDTH}
                height={THUMB_HEIGHT}
                className="block h-auto w-full"
              />
              <span className="block py-1 text-center font-mono text-[10px] text-muted">
                {tier.code}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
