// Single definition of the app's locales — every routing/i18n module derives from this.
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
});
