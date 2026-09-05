// Labeled text input (label is mandatory — a11y floor) with an inline error slot.
import type { ChangeEventHandler, ReactNode } from "react";

export interface InputProps {
  id: string;
  label: string;
  type?: "text" | "email" | "password";
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  /** Rendered at the inline-end inside the field (e.g. a password-visibility toggle). */
  trailing?: ReactNode;
  className?: string;
}

export function Input({
  id,
  label,
  type = "text",
  name,
  value,
  defaultValue,
  onChange,
  error,
  required,
  autoComplete,
  autoFocus,
  trailing,
  className,
}: InputProps) {
  const errorId = `${id}-error`;
  const input = (
    <input
      id={id}
      name={name ?? id}
      type={type}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      required={required}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      // Hazard, not alert: #FF3B30 is reserved for TD surfaces (spec section 8).
      // pe-10 clears the trailing slot; w-full because the relative wrapper is
      // a plain block, not the stretching flex column.
      className={`h-10 rounded border bg-surface px-3 text-sm text-text placeholder:text-muted ${
        error ? "border-hazard" : "border-line"
      }${trailing ? " w-full pe-10" : ""}`}
    />
  );
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </label>
      {trailing ? (
        <div className="relative">
          {input}
          <div className="absolute end-1.5 top-1/2 -translate-y-1/2">{trailing}</div>
        </div>
      ) : (
        input
      )}
      {error ? (
        <p id={errorId} className="text-xs text-hazard">
          {error}
        </p>
      ) : null}
    </div>
  );
}
