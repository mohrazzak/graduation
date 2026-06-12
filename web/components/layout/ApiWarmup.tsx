"use client";
// Wakes the prediction API the moment any page loads (free-tier hosting
// sleeps it after idle), so the first analyze never eats the cold start.
// Renders nothing; failures are deliberately invisible.
import { useEffect } from "react";
import { warmUpApi } from "@/lib/api";

export function ApiWarmup() {
  useEffect(() => {
    warmUpApi();
  }, []);
  return null;
}
