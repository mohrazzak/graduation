"use client";
// Accessible dialog shell: dimmed backdrop + focus management (move in, trap,
// restore) + Esc/backdrop close, with a reduced-motion-gated entrance fade.
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface ModalShellProps {
  /** id of the heading element inside `children` that names the dialog. */
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}

// Everything reachable by Tab inside the dialog (links, enabled buttons, the
// container itself is tabIndex=-1 so it is excluded on purpose).
const TABBABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalShell({ labelledBy, onClose, children }: ModalShellProps) {
  const reduced = useReducedMotion() ?? false;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // WHY: focus must move INTO the dialog on open (screen readers announce
    // it, Esc works immediately) and return to the opener card on close so
    // keyboard users are not dropped back at the top of the document.
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    // WHY a manual trap: aria-modal hides the page from assistive tech but
    // does NOT stop Tab from escaping to the content behind the backdrop, so
    // wrap focus from the last tabbable element back to the first (and reverse).
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const tabbables = dialog.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR);
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        // Clicks inside the panel must not bubble to the closing backdrop.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className="relative max-h-full w-full max-w-2xl overflow-y-auto rounded border border-line bg-surface p-5 sm:p-6"
      >
        {children}
      </div>
    </motion.div>
  );
}
