// Site footer: project name, university, supervisor, year (mono) over a hairline top border.
import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p>{t("projectName")}</p>
        <p>{t("university")}</p>
        <p>{t("supervisor")}</p>
        <p className="font-mono">{t("year")}</p>
      </div>
    </footer>
  );
}
