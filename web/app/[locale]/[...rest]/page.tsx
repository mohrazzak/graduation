// Catch-all for unknown paths under a valid locale: delegates to notFound() so
// app/[locale]/not-found.tsx renders inside the locale layout (next-intl pattern).
import { notFound } from "next/navigation";

export default function CatchAllPage(): never {
  notFound();
}
