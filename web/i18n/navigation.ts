// Locale-aware navigation APIs — always use these instead of next/link & next/navigation
// so hrefs keep their /en | /ar prefix automatically.
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
