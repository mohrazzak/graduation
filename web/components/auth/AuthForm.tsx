"use client";
// Shared login/register form: inline validation, Supabase sign-in/up via
// lib/supabase/auth, and a locale-aware redirect once the session exists.
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { signIn, signUp, type AuthErrorCode } from "@/lib/supabase/auth";
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "@/lib/validation";

export interface AuthFormProps {
  mode: "login" | "register";
  /** Locale-stripped internal path to land on after auth (page validates it). */
  nextPath?: string;
}

// Stable AuthErrorCode union -> message ids; raw Supabase text never reaches the UI.
const SUBMIT_ERROR_KEYS: Record<AuthErrorCode, string> = {
  invalid_credentials: "auth.errors.invalidCredentials",
  email_taken: "auth.errors.emailTaken",
  weak_password: "auth.errors.weakPassword",
  network: "auth.errors.networkError",
  not_configured: "auth.errors.notConfigured",
  unknown: "errors.generic",
};

interface FieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
}

export function AuthForm({ mode, nextPath = "/analyze" }: AuthFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (mode === "register") {
      const nameError = validateDisplayName(displayName);
      if (nameError) errors.displayName = t(`auth.errors.${nameError}`);
    }
    const emailError = validateEmail(email);
    if (emailError) errors.email = t(`auth.errors.${emailError}`);
    const passwordError = validatePassword(password);
    if (passwordError) errors.password = t(`auth.errors.${passwordError}`);

    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.values(errors).some(Boolean)) return;

    setPending(true);
    const { error } =
      mode === "login"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, displayName.trim());
    if (error !== null) {
      setSubmitError(t(SUBMIT_ERROR_KEYS[error]));
      setPending(false);
      return;
    }
    // refresh() forces the server-rendered Navbar to re-read getServerUser();
    // without it the client cache keeps painting the signed-out chrome.
    router.replace(nextPath);
    router.refresh();
  }

  return (
    // noValidate: our inline messages replace the browser's native bubbles.
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {mode === "register" ? (
        <Input
          id="displayName"
          label={t("auth.register.displayName")}
          autoComplete="name"
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={fieldErrors.displayName}
        />
      ) : null}
      <Input
        id="email"
        type="email"
        label={t(`auth.${mode}.email`)}
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
      />
      <Input
        id="password"
        type="password"
        label={t(`auth.${mode}.password`)}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
      />
      {submitError !== null ? (
        <p
          role="alert"
          // Hazard, not alert: #FF3B30 is reserved for level-4/5 surfaces (spec section 8).
          className="rounded border border-hazard/40 bg-hazard/10 px-3 py-2 text-xs text-hazard"
        >
          {submitError}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? <Spinner /> : null}
        {t(`auth.${mode}.submit`)}
      </Button>
    </form>
  );
}
