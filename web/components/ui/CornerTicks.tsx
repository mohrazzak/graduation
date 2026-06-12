// Four L-shaped registration marks pinned to the corners of a `relative` parent,
// echoing the crosshair ticks on structural survey photos (spec section 8).
export interface CornerTicksProps {
  className?: string;
}

export function CornerTicks({ className }: CornerTicksProps) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className ?? ""}`}>
      <span className="absolute start-0 top-0 h-2 w-2 border-s border-t border-muted" />
      <span className="absolute end-0 top-0 h-2 w-2 border-e border-t border-muted" />
      <span className="absolute bottom-0 start-0 h-2 w-2 border-b border-s border-muted" />
      <span className="absolute bottom-0 end-0 h-2 w-2 border-b border-e border-muted" />
    </span>
  );
}
