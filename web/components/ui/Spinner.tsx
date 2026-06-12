// Square technical spinner (no playful circles). `motion-safe` keeps it a static
// hazard-edged square when the user prefers reduced motion.
export interface SpinnerProps {
  /** Announced to assistive tech when given; the spinner is decorative otherwise. */
  label?: string;
  className?: string;
}

export function Spinner({ label, className }: SpinnerProps) {
  return (
    <span
      {...(label !== undefined
        ? { role: "status", "aria-label": label }
        : { "aria-hidden": true })}
      className={`inline-block h-4 w-4 border-2 border-line border-t-hazard motion-safe:animate-spin ${className ?? ""}`}
    />
  );
}
