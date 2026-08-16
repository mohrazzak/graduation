// Published evaluation facts: the dataset the classifiers were trained on, what
// each one scored, and the full confusion matrices. Single source of truth for
// the how-it-works page, so no number is ever typed into JSX.
//
// All figures are measured on the SAME PHI-Net Task 5 validation split (146
// images) on 2026-08-17. An earlier YOLO model scored 0.8037, but on a
// two-class split with NC dropped — that number is not comparable to these and
// must not be published.
import type { TierCode } from "./tiers";

export interface TierMetrics {
  readonly precision: number; // 0..1
  readonly recall: number; // 0..1
  readonly support: number; // validation images of this class
}

export interface ModelEvaluation {
  /** Matches the backend registry id, so the picker and this page agree. */
  readonly id: string;
  readonly name: string;
  readonly architecture: string;
  /** Validation top-1 accuracy, 0..1. */
  readonly accuracy: number;
  readonly correct: number;
  readonly total: number;
  /** Rows are ACTUAL tiers, inner keys are PREDICTED tiers. */
  readonly confusion: Readonly<Record<TierCode, Readonly<Record<TierCode, number>>>>;
  readonly perTier: Readonly<Record<TierCode, TierMetrics>>;
}

export const MODEL_EVALUATIONS: readonly ModelEvaluation[] = [
  {
    id: "resnet50-phinet",
    name: "ResNet50",
    architecture: "ResNet50 + ImageNet transfer learning",
    accuracy: 0.7466,
    correct: 109,
    total: 146,
    confusion: {
      NC: { NC: 23, PC: 14, GC: 2 },
      PC: { NC: 7, PC: 25, GC: 8 },
      GC: { NC: 0, PC: 6, GC: 61 },
    },
    perTier: {
      NC: { precision: 0.7667, recall: 0.5897, support: 39 },
      PC: { precision: 0.5556, recall: 0.625, support: 40 },
      GC: { precision: 0.8592, recall: 0.9104, support: 67 },
    },
  },
  {
    id: "yolo-cls",
    name: "YOLO11-cls",
    architecture: "YOLO11 nano classifier",
    accuracy: 0.7123,
    correct: 104,
    total: 146,
    confusion: {
      NC: { NC: 25, PC: 11, GC: 3 },
      PC: { NC: 7, PC: 23, GC: 10 },
      GC: { NC: 3, PC: 8, GC: 56 },
    },
    perTier: {
      NC: { precision: 0.7143, recall: 0.641, support: 39 },
      PC: { precision: 0.5476, recall: 0.575, support: 40 },
      GC: { precision: 0.8116, recall: 0.8358, support: 67 },
    },
  },
] as const;

/** The model whose per-class breakdown and matrix the page charts by default. */
export const PRIMARY_EVALUATION: ModelEvaluation = MODEL_EVALUATIONS[0]!;

export interface DatasetSplit {
  readonly tier: TierCode;
  readonly train: number;
  readonly val: number;
}

// PHI-Net Task 5 (Collapse Mode), as split for training.
export const DATASET_SPLITS: readonly DatasetSplit[] = [
  { tier: "NC", train: 322, val: 39 },
  { tier: "PC", train: 379, val: 40 },
  { tier: "GC", train: 525, val: 67 },
] as const;

export const DATASET_TOTALS = {
  train: DATASET_SPLITS.reduce((sum, split) => sum + split.train, 0),
  val: DATASET_SPLITS.reduce((sum, split) => sum + split.val, 0),
} as const;
