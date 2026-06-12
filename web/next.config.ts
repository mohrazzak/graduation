import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // The docker runner stage copies .next/standalone (a self-contained
  // server.js + pruned node_modules) instead of shipping the full install.
  output: "standalone",
};

// Wires i18n/request.ts into the App Router so server components can resolve messages.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
