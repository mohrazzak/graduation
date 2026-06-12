// Three typographic roles — display (Archivo), body (Inter), data (JetBrains Mono) —
// plus the Arabic variant (IBM Plex Sans Arabic) are part of the design identity (spec section 8).
import {
  Archivo,
  IBM_Plex_Sans_Arabic,
  Inter,
  JetBrains_Mono,
} from "next/font/google";

export const archivo = Archivo({
  weight: ["700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-archivo",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
});
