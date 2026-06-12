// Designed 404 (spec sections 3 + 7): quiet instrument-style "no such route"
// state, rendered inside the locale layout so navbar/footer/dir stay correct.
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-20 text-center">
      {/* Mono digits: the data voice carries the status code, like a readout. */}
      <p className="font-mono text-7xl font-bold leading-none text-muted">{t("code")}</p>
      <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {t("title")}
      </h1>
      <p className="max-w-sm text-sm text-muted">{t("body")}</p>
      <Button variant="ghost" href="/">
        {t("cta")}
      </Button>
    </div>
  );
}
