// Published evaluation facts for the model that actually ships. Single source
// of truth for the how-it-works page, so no number is ever typed into JSX.
//
// These figures are read from the checkpoint's own recorded history
// (`train_metrics` and `train_results` in raed_yolov8s_4class.pt), so they
// describe the exact weights being served rather than a re-run that could
// drift from them.
//
// ⚠ They are DETECTION metrics, not classification accuracy. The model locates
// damaged regions and labels each one; mean average precision over IoU
// thresholds is how that is measured. Retired classifier accuracies once
// published here (ResNet50 74.66%, YOLO11-cls 71.23%, and an older two-class
// 80.37%) described models that no longer exist in this product and are NOT
// comparable to these numbers, which is why they are gone rather than shown
// side by side.
//
// ⚠ There is no accuracy or confidence figure here because the detector has
// neither: the checkpoint records none, and the detection validation split is
// not on this machine to compute one from. An image-level accuracy would have
// to be measured against that split before it could be published.
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
  /** Training and validation image size, px. */
  readonly imageSize: number;
  readonly metrics: readonly DetectionMetric[];
}

export const PRIMARY_EVALUATION: ModelEvaluation = {
  id: "raed",
  architecture: "YOLOv8s",
  imageSize: 800,
  metrics: [
    { key: "map50", value: 0.31478, headline: true },
    { key: "map5095", value: 0.19023 },
    { key: "precision", value: 0.34975 },
    { key: "recall", value: 0.46396 },
  ],
} as const;

export type LossKey = "box" | "cls" | "dfl";

export interface LossSeries {
  readonly key: LossKey;
  /** Per-epoch training loss; index 0 is epoch 1. */
  readonly train: readonly number[];
  /** Per-epoch validation loss, same indexing as `train`. */
  readonly validation: readonly number[];
}

export interface TrainingRun {
  /** Epochs the run was CONFIGURED for. Early stopping ended it sooner. */
  readonly plannedEpochs: number;
  /** Epochs without improvement that trigger the early stop. */
  readonly patience: number;
  /** Epochs actually recorded in the checkpoint. */
  readonly epochs: number;
  /** 1-indexed epoch whose weights ship, chosen by best fitness. */
  readonly bestEpoch: number;
  /** Per-epoch mAP@50-95 — this run's fitness, and what picked `bestEpoch`. */
  readonly fitness: readonly number[];
  readonly losses: readonly LossSeries[];
}

/**
 * The served checkpoint's own `train_results`, verbatim.
 *
 * Publishing the curve rather than a lone summary number is what lets the page
 * state honestly that training early-stopped: the run was configured for 150
 * epochs, ran 55, and ships epoch 25 — the fitness argmax. Saying "150 epochs"
 * (as this page once did) describes a run that never happened.
 */
export const TRAINING_RUN: TrainingRun = {
  plannedEpochs: 150,
  patience: 30,
  epochs: 55,
  bestEpoch: 25,
  fitness: [
    0.1033, 0.06611, 0.09068, 0.10257, 0.10514, 0.11709, 0.11985, 0.12081, 0.1269, 0.13416, 0.13981,
    0.13375, 0.12834, 0.14987, 0.15433, 0.1457, 0.15657, 0.17118, 0.13703, 0.14458, 0.1451, 0.15084,
    0.15756, 0.16193, 0.19023, 0.15293, 0.14563, 0.14181, 0.17243, 0.15709, 0.15216, 0.16476,
    0.14832, 0.1548, 0.15209, 0.16284, 0.16421, 0.15399, 0.16748, 0.14966, 0.1594, 0.18511, 0.15568,
    0.15536, 0.17244, 0.15507, 0.15703, 0.17163, 0.18058, 0.16514, 0.17596, 0.16063, 0.15236,
    0.16768, 0.16993,
  ],
  losses: [
    {
      key: "box",
      train: [
        1.5996, 1.49003, 1.48216, 1.43535, 1.36863, 1.30007, 1.27832, 1.24359, 1.1854, 1.17743,
        1.15604, 1.11986, 1.09723, 1.08267, 1.06531, 1.03858, 1.03576, 1.02421, 1.01037, 0.99586,
        0.97242, 0.96449, 0.93832, 0.93852, 0.93814, 0.91404, 0.93055, 0.9039, 0.91584, 0.89877,
        0.88622, 0.86291, 0.86283, 0.86758, 0.83767, 0.84973, 0.82328, 0.82698, 0.81608, 0.82253,
        0.81997, 0.81015, 0.80903, 0.80802, 0.80041, 0.80158, 0.78986, 0.78452, 0.77258, 0.77915,
        0.76746, 0.75741, 0.7611, 0.75109, 0.74083,
      ],
      validation: [
        1.94824, 1.77065, 1.797, 1.74214, 1.67232, 1.64312, 1.71126, 1.6973, 1.61834, 1.62019,
        1.54225, 1.614, 1.59652, 1.46629, 1.48913, 1.46729, 1.43109, 1.48879, 1.57908, 1.52461,
        1.44741, 1.44587, 1.44666, 1.40308, 1.49777, 1.51973, 1.50233, 1.49694, 1.43329, 1.44193,
        1.48272, 1.46041, 1.53111, 1.46228, 1.44443, 1.46192, 1.48394, 1.47252, 1.45726, 1.4838,
        1.49211, 1.4371, 1.42299, 1.46005, 1.45133, 1.41279, 1.46253, 1.45215, 1.43939, 1.42676,
        1.45648, 1.48311, 1.46239, 1.39688, 1.39684,
      ],
    },
    {
      key: "cls",
      train: [
        2.65823, 2.32055, 2.26983, 2.17004, 2.0626, 1.9016, 1.8522, 1.77617, 1.70188, 1.68006,
        1.63718, 1.55928, 1.51896, 1.4736, 1.44138, 1.38103, 1.3843, 1.37385, 1.33442, 1.31609,
        1.27023, 1.26117, 1.23429, 1.23009, 1.20815, 1.19304, 1.18832, 1.16542, 1.16182, 1.14599,
        1.1252, 1.0817, 1.08157, 1.11311, 1.04775, 1.06254, 1.03258, 1.04258, 1.02346, 1.01156,
        1.02074, 0.99905, 1.009, 1.00017, 0.98722, 0.96711, 0.95859, 0.94372, 0.93492, 0.94937,
        0.91486, 0.90697, 0.91098, 0.90001, 0.87992,
      ],
      validation: [
        3.50404, 3.12079, 3.44214, 2.94535, 2.97383, 2.74049, 2.64754, 2.55725, 2.56811, 2.53435,
        2.42841, 2.45817, 2.49632, 2.3623, 2.26415, 2.54468, 2.2862, 2.32334, 2.71952, 2.31246,
        2.45977, 2.35533, 2.30343, 2.38138, 2.25688, 2.31402, 2.30272, 2.28005, 2.24048, 2.26591,
        2.31456, 2.21679, 2.29852, 2.31845, 2.2496, 2.18647, 2.2393, 2.34671, 2.32492, 2.26079,
        2.29634, 2.17449, 2.29077, 2.32239, 2.25198, 2.25846, 2.36178, 2.26549, 2.22317, 2.26658,
        2.36403, 2.35148, 2.3326, 2.29709, 2.34695,
      ],
    },
    {
      key: "dfl",
      train: [
        2.03851, 1.96037, 1.96875, 1.90609, 1.85379, 1.7903, 1.75924, 1.71913, 1.67719, 1.67284,
        1.65266, 1.61827, 1.59791, 1.58217, 1.56485, 1.5314, 1.53449, 1.53809, 1.51268, 1.50459,
        1.47806, 1.47176, 1.45398, 1.45367, 1.45118, 1.4307, 1.44748, 1.42159, 1.43001, 1.40822,
        1.40916, 1.38576, 1.39502, 1.3897, 1.36826, 1.37739, 1.35548, 1.35587, 1.34529, 1.3504,
        1.34229, 1.34433, 1.3451, 1.34613, 1.33143, 1.32951, 1.32108, 1.31777, 1.311, 1.31251,
        1.30498, 1.29381, 1.30119, 1.29381, 1.28644,
      ],
      validation: [
        2.57146, 2.34952, 2.40175, 2.3707, 2.24114, 2.23961, 2.35873, 2.27046, 2.24735, 2.24705,
        2.15736, 2.18912, 2.25871, 2.07208, 2.1335, 2.08815, 2.02388, 2.10709, 2.22009, 2.18372,
        2.06702, 2.0585, 2.11372, 2.03679, 2.14396, 2.13794, 2.18159, 2.17023, 2.07091, 2.06304,
        2.10554, 2.1104, 2.16657, 2.12628, 2.095, 2.10831, 2.14928, 2.1416, 2.14555, 2.17531,
        2.14288, 2.12917, 2.06355, 2.12848, 2.10344, 2.05068, 2.1499, 2.12206, 2.09757, 2.05238,
        2.09656, 2.15018, 2.12049, 2.08401, 2.09629,
      ],
    },
  ],
} as const;

/** Array index of the shipped epoch, so the 1-based caption converts in one place. */
export function bestEpochIndex(): number {
  return TRAINING_RUN.bestEpoch - 1;
}

export interface ValidationLoss {
  readonly key: LossKey;
  readonly value: number;
}

/**
 * Validation loss at the shipped epoch, READ OFF the curve instead of retyped.
 * A loss that disagreed with the chart beside it would be indefensible, and
 * deriving it makes that disagreement unrepresentable.
 */
export const VALIDATION_LOSSES: readonly ValidationLoss[] = TRAINING_RUN.losses.map((series) => ({
  key: series.key,
  value: series.validation[bestEpochIndex()] ?? 0,
}));
