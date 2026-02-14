/** Status for the training job (panel + live overlay). */
export type TrainingStatus =
  | "idle"
  | "starting"
  | "running"
  | "completed"
  | "stopped"
  | "error";

/** One epoch of metrics from the training WebSocket. */
export interface EpochMetric {
  epoch: number;
  train_loss: number;
  val_loss: number;
  train_acc: number;
  val_acc: number;
  elapsed_sec: number;
}

/** Live batch update (sent every N batches during training). */
export interface BatchUpdate {
  epoch: number;
  batch: number;
  loss: number;
}

export interface LiveTrainingState {
  status: TrainingStatus;
  metrics: EpochMetric[];
  lastMessage: Record<string, unknown> | null;
  totalEpochs?: number;
  totalBatches?: number;
  latestBatch?: BatchUpdate | null;
}
