// Three typographic roles — display (Archivo), body (Inter), data (JetBrains Mono) —
// plus the Arabic variant (Cairo) are part of the design identity (spec section 8,
// Arabic font amended by specs/2026-06-12-landing-imagery-cairo-design.md).
import { Archivo, Cairo, Inter, JetBrains_Mono } from "next/font/google";

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

// Cairo is a variable font (wght 200-1000): one file covers every weight, so
// Arabic display headings get the same heavy punch as Archivo's Latin ones.
export const cairo = Cairo({
  subsets: ["arabic"],
  variable: "--font-arabic",
});
