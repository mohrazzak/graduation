// Dashed mono chip marking copy/figures the student replaces after data
// collection or training — placeholders must visibly read as placeholders.
export interface PlaceholderTagProps {
  label: string;
  className?: string;
}

export function PlaceholderTag({ label, className }: PlaceholderTagProps) {
  return (
    <span
      className={`inline-flex items-center rounded border border-dashed border-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-muted ${className ?? ""}`}
    >
      {label}
    </span>
  );
}
