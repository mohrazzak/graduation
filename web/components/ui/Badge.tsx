// Mono-font chip tinted by a caller-supplied ramp color (border/text + faint bg).
export interface BadgeProps {
  label: string;
  /** 6-digit hex (from DAMAGE_LEVELS) — alpha suffixes derive the border/bg tints. */
  color: string;
  className?: string;
}

export function Badge({ label, color, className }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs ${className ?? ""}`}
      style={{ borderColor: `${color}66`, color, backgroundColor: `${color}14` }}
    >
      {label}
    </span>
  );
}
