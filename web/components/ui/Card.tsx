// Surface panel: hairline border, 4px radius, optional survey-photo corner ticks.
import type { ReactNode } from "react";
import { CornerTicks } from "./CornerTicks";

export interface CardProps {
  children: ReactNode;
  /** Adds the corner registration marks used on key cards. */
  ticks?: boolean;
  className?: string;
}

export function Card({ children, ticks = false, className }: CardProps) {
  return (
    <div className={`relative rounded border border-line bg-surface p-5 ${className ?? ""}`}>
      {ticks ? <CornerTicks /> : null}
      {children}
    </div>
  );
}
