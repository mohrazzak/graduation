"use client";
// Minimal bottom toast: surface card with a hairline border that auto-dismisses
// after ~5s; optional inline link (e.g. "Saved to history" -> /history).
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState, type FocusEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export interface ToastProps {
  message: string;
  href?: string;
  linkLabel?: string;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 5000;

export function Toast({ message, href, linkLabel, onDismiss }: ToastProps) {
  const t = useTranslations("common.actions");
  const reduced = useReducedMotion() ?? false;
  // WHY pause: WCAG 2.2.1 (Timing Adjustable) — auto-dismiss is a time limit,
  // so it must hold while the user is reading or operating the toast (hover,
  // or keyboard focus within).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return undefined;
    // Resuming restarts the FULL duration: simpler than bookkeeping remaining
    // milliseconds, and granting MORE reading time is the accessible direction.
    const id = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [paused, onDismiss]);

  function onBlur(event: FocusEvent<HTMLDivElement>): void {
    // Unpause only when focus leaves the toast entirely — moving between the
    // inline link and the close button keeps relatedTarget inside.
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
      setFocused(false);
    }
  }

  return (
    <motion.div
      role="status"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-4 rounded border border-line bg-surface px-4 py-3 text-sm"
    >
      <span>{message}</span>
      {href !== undefined && linkLabel !== undefined ? (
        <Link href={href} className="shrink-0 text-hazard hover:underline">
          {linkLabel}
        </Link>
      ) : null}
      <button
        type="button"
        aria-label={t("close")}
        onClick={onDismiss}
        className="shrink-0 text-muted transition-colors duration-150 hover:text-text"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
