// Published evaluation facts: the dataset the classifiers were trained on and
// what each one scored. Single source of truth for the how-it-works page and
// the footer citation, so no number is ever typed into JSX.
//
// Figures are validation top-1 accuracy over the SAME three-class split. An
// earlier YOLO model scored 0.8037, but on a two-class split with NC dropped —
// that number is not comparable to these and must not be published.
import type { TierCode } from "./tiers";

export interface ModelEvaluation {
  /** Matches the backend registry id, so the picker and this page agree. */
  readonly id: string;
  readonly name: string;
  readonly architecture: string;
  /** Validation top-1 accuracy, 0..1. */
  readonly accuracy: number;
}

export const MODEL_EVALUATIONS: readonly ModelEvaluation[] = [
  {
    id: "resnet50-phinet",
    name: "ResNet50",
    architecture: "ResNet50 + ImageNet transfer learning",
    accuracy: 0.7466,
  },
  {
    id: "yolo-cls",
    name: "YOLO11-cls",
    architecture: "YOLO11 nano classifier",
    accuracy: 0.7123,
  },
] as const;

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
