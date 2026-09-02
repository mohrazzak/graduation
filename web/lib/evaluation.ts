// Published evaluation facts for the model that actually ships. Single source
// of truth for the how-it-works page, so no number is ever typed into JSX.
//
// These figures are read from the checkpoint's own recorded validation metrics
// (`train_metrics` in raed_yolov8s_4class.pt), so they describe the exact
// weights being served rather than a re-run that could drift from them.
//
// ⚠ They are DETECTION metrics, not classification accuracy. The model locates
// damaged regions and labels each one; mean average precision over IoU
// thresholds is how that is measured. Retired classifier accuracies once
// published here (ResNet50 74.66%, YOLO11-cls 71.23%, and an older two-class
// 80.37%) described models that no longer exist in this product and are NOT
// comparable to these numbers, which is why they are gone rather than shown
// side by side.
export interface DetectionMetric {
  /** Message key under `howItWorks.metrics.names`, never prose. */
  readonly key: "precision" | "recall" | "map50" | "map5095";
  /** 0..1. */
  readonly value: number;
  /** True for the figure a reader should treat as the headline. */
  readonly headline?: boolean;
}

export interface ModelEvaluation {
  /** Matches the backend registry id, so the picker and this page agree. */
  readonly id: string;
  readonly architecture: string;
  readonly epochs: number;
  /** Training and validation image size, px. */
  readonly imageSize: number;
  readonly metrics: readonly DetectionMetric[];
}

export const PRIMARY_EVALUATION: ModelEvaluation = {
  id: "raed",
  architecture: "YOLOv8s",
  epochs: 150,
  imageSize: 800,
  metrics: [
    { key: "map50", value: 0.31478, headline: true },
    { key: "map5095", value: 0.19023 },
    { key: "precision", value: 0.34975 },
    { key: "recall", value: 0.46396 },
  ],
} as const;
