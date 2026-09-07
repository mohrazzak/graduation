// The monospaced LABEL value rows on the report (header: Report ID, Date; footer:
// Model, Scale, Outputs), written once so the two blocks cannot drift. A typographic
// primitive: no next-intl hooks, no message keys — label and value arrive translated.

export interface ReportMetaEntry {
  label: string;
  value: string;
}

export interface ReportMetaListProps {
  entries: ReportMetaEntry[];
  className?: string;
}

export function ReportMetaList({ entries, className }: ReportMetaListProps) {
  return (
    <dl
      className={`font-mono text-[7pt] leading-tight whitespace-nowrap text-end${
        className ? ` ${className}` : ""
      }`}
    >
      {entries.map((entry) => (
        <div key={entry.label}>
          <dt className="inline uppercase text-[color:var(--report-ink-soft)]">
            {entry.label}
          </dt>
          {/* Preflight zeroes dd's margin and JSX drops the whitespace between
              siblings, so without an explicit gap label and value run together. */}
          <dd className="ms-[1.5mm] inline">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}
