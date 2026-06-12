"use client";
// Responsive grid of saved assessments: 1 column mobile, 2 small, 3 large.
import type { Analysis } from "@/lib/types";
import { AnalysisCard } from "./AnalysisCard";

export interface HistoryGridProps {
  analyses: Analysis[];
  /** analysis id -> signed thumbnail URL (null when signing failed). */
  imageUrls: Record<string, string | null>;
  onOpen: (analysis: Analysis) => void;
}

export function HistoryGrid({ analyses, imageUrls, onOpen }: HistoryGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {analyses.map((analysis) => (
        <li key={analysis.id}>
          <AnalysisCard
            analysis={analysis}
            imageUrl={imageUrls[analysis.id] ?? null}
            onOpen={() => onOpen(analysis)}
          />
        </li>
      ))}
    </ul>
  );
}
