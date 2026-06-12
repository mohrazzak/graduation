// Labeled text input (label is mandatory — a11y floor) with an inline error slot.
import type { ChangeEventHandler } from "react";

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
  className,
}: InputProps) {
  const errorId = `${id}-error`;
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </label>
      <input
        id={id}
        name={name ?? id}
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        // Hazard, not alert: #FF3B30 is reserved for level-4/5 surfaces (spec section 8).
        className={`h-10 rounded border bg-surface px-3 text-sm text-text placeholder:text-muted ${
          error ? "border-hazard" : "border-line"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-xs text-hazard">
          {error}
        </p>
      ) : null}
    </div>
  );
}
