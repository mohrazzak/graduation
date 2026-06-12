"use client";
// Navbar sign-out control: ends the Supabase session, then returns to the landing page.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { signOut } from "@/lib/supabase/auth";

export function LogoutButton() {
  const t = useTranslations("common.actions");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout(): Promise<void> {
    setPending(true);
    await signOut();
    router.push("/");
    // refresh() so the server Navbar re-reads getServerUser() and swaps back
    // to the signed-out chrome — the client router cache won't do it alone.
    router.refresh();
  }

  return (
    <Button variant="ghost" size="md" onClick={handleLogout} disabled={pending}>
      {t("logout")}
    </Button>
  );
}
