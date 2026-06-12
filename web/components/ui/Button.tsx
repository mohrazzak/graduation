// Action button: primary (hazard CTA with the tape-stripe top edge), ghost, danger.
// Renders a locale-aware Link instead of <button> when `href` is provided.
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "md" | "lg";

export interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When set, renders an i18n Link styled as a button. */
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

// Focus ring comes from the global :focus-visible rule — no per-variant ring classes.
const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded font-semibold uppercase tracking-wider transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-hazard text-bg hover:bg-hazard/85",
  ghost: "border border-line text-text hover:border-muted",
  // Destructive actions wear the hazard accent, not alert red — #FF3B30 is
  // reserved for level-4/5 surfaces only (spec section 8).
  danger: "border border-hazard text-hazard hover:bg-hazard/10",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "h-9 px-4 text-xs",
  lg: "h-12 px-6 text-sm",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  type = "button",
  disabled,
  onClick,
  className,
}: ButtonProps) {
  const classes = `${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ""}`;
  const content = (
    <>
      {/* The one hazard-stripe motif allowed on CTAs (spec section 8). */}
      {variant === "primary" ? (
        <span aria-hidden="true" className="hazard-stripe absolute inset-x-0 top-0" />
      ) : null}
      {children}
    </>
  );

  if (href !== undefined) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={classes}>
      {content}
    </button>
  );
}
