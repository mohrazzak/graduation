# Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Design approved in-session 2026-06-12 (live audit found 4 bugs; screenshots in ~/auth-audit/).

**Goal:** Honest signup outcomes, correct error mapping, race-free post-login navigation, password visibility toggle, autofocus.

**Bugs being fixed (from the live audit):**
1. Registration with email-confirmation ON silently bounces to login (no message).
2. `email_not_confirmed` and `over_email_send_rate_limit` render the generic error.
3. Intermittent valid-login bounce (cookie/middleware race on client nav) + perpetual pending spinner.
4. Duplicate email never reported when confirmation ON (Supabase obfuscation).

**Testing model:** gates (tsc/lint/build, JSON.parse catalogs) + local docker rebuild + browser re-test of every fixed flow + live re-verify after Vercel deploy.

---

### Task 1: lib + UI changes (single coupled change-set)

**Files:**
- Modify: `web/lib/supabase/auth.ts` — `AuthErrorCode` gains `"email_not_confirmed" | "rate_limited"`; `mapAuthError` gains `case "email_not_confirmed"` and `case "over_email_send_rate_limit"`; `signUp` returns `{ error, confirmationRequired?: boolean }`: after a no-error response inspect `data` — `user && !session` → `confirmationRequired: true`; `user.identities?.length === 0` → `{ error: "email_taken" }` (obfuscated duplicate).
- Modify: `web/components/auth/AuthForm.tsx` —
  - new submit-error keys: `email_not_confirmed: "auth.errors.emailNotConfirmed"`, `rate_limited: "auth.errors.rateLimited"`.
  - register outcome `confirmationRequired` → replace the form with a success notice (`auth.register.confirmationNotice`) + a Link to `/login` (keep `next` query alive), role="status".
  - success navigation: full page load instead of client nav — `window.location.assign` of the LOCALE-PREFIXED next path (use `useLocale()`; nextPath is locale-less). This makes the middleware see fresh cookies deterministically (kills the race). Keep `pending` true through the unload (spinner during nav is correct); add `finally`-style reset only on error paths (already exists).
  - autofocus: `autoFocus` on displayName (register) / email (login).
  - password field gets a visibility toggle (see Input change), labels `auth.password.show` / `auth.password.hide`, `aria-pressed`, type swaps password/text.
- Modify: `web/components/ui/Input.tsx` — optional `trailing?: ReactNode` slot rendered inside a relative wrapper at the inline-end of the input (logical positioning, `pe-10` on the input when trailing present). No behavior change when unused.
- Modify: `web/middleware.ts` (read first!) — inverse guard: authenticated user requesting `/login` or `/register` → redirect to sanitized `?next=` or `/analyze`. Follow the existing locale handling pattern in that file exactly.
- Modify: `web/messages/en.json` + `ar.json`:
  - `auth.errors.emailNotConfirmed`: "Confirm your email first — check your inbox, then log in." / "أكّد بريدك الإلكتروني أولًا — راجع صندوق الوارد ثم سجّل الدخول."
  - `auth.errors.rateLimited`: "Too many attempts. Wait a minute, then retry." / "محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة."
  - `auth.register.confirmationNotice`: "Account created. Check your inbox to confirm your email, then log in." / "تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيد حسابك ثم سجّل الدخول."
  - `auth.password.show`: "Show password" / "أظهر كلمة المرور"; `auth.password.hide`: "Hide password" / "أخفِ كلمة المرور"

Gates: tsc/lint/build + JSON.parse. Commit: `fix(web): honest auth outcomes, race-free login nav, password toggle, autofocus`.

### Task 2: local browser verification of every fixed flow

Docker rebuild web; playwright-over-CDP against localhost: (1) register fresh user → confirmation notice visible (NO silent bounce); (2) login unconfirmed → emailNotConfirmed message; (3) valid login ×5 consecutive → analyze every time, zero bounces; (4) authed visit to /login → redirected away; (5) eye toggle works + aria-pressed; (6) autofocus lands on first field; (7) /ar pass of 1+2; (8) keyboard: toggle reachable, Enter still submits. Screenshots under $HOME, VIEWED.

### Task 3: ship

Merge to main, push origin, `npx vercel --prod`, live smoke of flows 1–3 on project.razzak.me, clean up any audit users created.
