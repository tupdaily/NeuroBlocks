"use client";

// ---------------------------------------------------------------------------
// TrainingPanel — v2: cleaner, friendlier, with beginner-friendly labels
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Node, Edge } from "@xyflow/react";
import {
  serializeGraphForTraining,
  startTraining,
  openTrainingWebSocket,
  stopTraining,
  fetchDatasets,
  type GraphSchema,
  type TrainingConfigSchema,
} from "@/neuralcanvas/lib/trainingApi";
import { saveTrainedModel } from "@/neuralcanvas/lib/modelsApi";
import type { TrainingStatus, EpochMetric, BatchUpdate } from "./types";
import { LiveTrainingOverlay } from "./LiveTrainingOverlay";
import { Play, Square, X, AlertTriangle, Database, Settings2, Zap } from "lucide-react";
import { createPlayground } from "@/lib/supabase/playgrounds";
import { neuralCanvasToGraphSchema } from "@/lib/levelGraphAdapter";

interface TrainingPanelProps {
  open: boolean;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
  compact?: boolean;
  playgroundId?: string;
  userId?: string;
  onPlaygroundCreated?: (id: string) => void;
}

const DEFAULT_CONFIG: TrainingConfigSchema = {
  epochs: 10,
  batch_size: 64,
  learning_rate: 0.001,
  optimizer: "adam",
  train_split: 0.8,
};

/** Friendly explanations for each training setting */
const SETTING_HINTS: Record<string, string> = {
  epochs: "How many times the model sees the entire dataset",
  batch_size: "How many samples the model processes at once",
  learning_rate: "How big the learning steps are (smaller = more careful)",
  optimizer: "The algorithm that adjusts the model weights",
  train_split: "Fraction of data used for training (rest for validation)",
};

export function TrainingPanel({ open: isOpen, onClose, nodes, edges, compact, playgroundId, userId, onPlaygroundCreated }: TrainingPanelProps) {
  const [datasets, setDatasets] = useState<{ id: string; name: string; description: string }[]>([]);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [config, setConfig] = useState<TrainingConfigSchema>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<TrainingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<EpochMetric[]>([]);
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null);
  const [totalBatches, setTotalBatches] = useState<number | undefined>(undefined);
  const [latestBatch, setLatestBatch] = useState<BatchUpdate | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const closeWsRef = useRef<(() => void) | null>(null);

  const datasetId = useMemo(() => {
    const inputNode = nodes.find((n) => (n.type as string) === "Input");
    const params = inputNode?.data?.params;
    if (params && typeof params === "object" && "dataset_id" in params) {
      const id = (params as Record<string, unknown>).dataset_id;
      return typeof id === "string" && id ? id : null;
    }
    return null;
  }, [nodes]);

  // Model save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelDescription, setModelDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingSuccess, setSavingSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchDatasets()
      .then((list) => {
        if (!cancelled) {
          setDatasets(list);
          setDatasetError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setDatasetError(e instanceof Error ? e.message : "Failed to load datasets");
          setDatasets([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const { graph, error: graphError } = useMemo(
    () => serializeGraphForTraining(nodes, edges),
    [nodes, edges]
  );

  const handleStart = useCallback(async () => {
    if (!graph || graphError) {
      setError(graphError ?? "Graph cannot be serialized for training.");
      return;
    }
    if (!datasetId) {
      setError("Select a dataset on the Input block.");
      return;
    }
    setError(null);
    setStatus("starting");
    setMetrics([]);
    setLastMessage(null);
    setTotalBatches(undefined);
    setLatestBatch(null);
    try {
      const { job_id } = await startTraining(graph, datasetId, config);
      setJobId(job_id);
      closeWsRef.current = openTrainingWebSocket(
        job_id,
        (msg) => {
          setLastMessage(msg);
          const type = msg.type as string;
          if (type === "connected" || type === "started") setStatus("running");
          if (type === "started") {
            const total = msg.total_batches as number | undefined;
            if (typeof total === "number") setTotalBatches(total);
          }
          if (type === "batch") {
            setLatestBatch({ epoch: msg.epoch as number, batch: msg.batch as number, loss: msg.loss as number });
          }
          if (type === "epoch") {
            setLatestBatch(null);
            setMetrics((m) => [
              ...m,
              {
                epoch: msg.epoch as number,
                train_loss: msg.train_loss as number,
                val_loss: msg.val_loss as number,
                train_acc: msg.train_acc as number,
                val_acc: msg.val_acc as number,
                elapsed_sec: msg.elapsed_sec as number,
              },
            ]);
          }
          if (type === "completed" || type === "stopped") {
            setStatus(type === "completed" ? "completed" : "stopped");
            setLatestBatch(null);
            // Show save dialog if training completed successfully
            if (type === "completed") {
              setShowSaveDialog(true);
              setModelName(`Model-${new Date().toLocaleTimeString().replace(/:/g, "-")}`);
            }
            closeWsRef.current?.();
            closeWsRef.current = null;
          }
          if (type === "error") {
            setError((msg.message as string) ?? "Training error");
            setStatus("error");
            setLatestBatch(null);
            closeWsRef.current?.();
            closeWsRef.current = null;
          }
        },
        () => {
          setStatus((s) => (s === "running" ? "stopped" : s));
          closeWsRef.current = null;
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start training");
      setStatus("error");
    }
  }, [graph, graphError, config, datasetId]);

  const handleStop = useCallback(() => {
    if (jobId) {
      stopTraining(jobId).catch(() => {});
      closeWsRef.current?.();
    }
    setStatus("stopped");
  }, [jobId]);

  const handleSaveModel = useCallback(async () => {
    if (!graph || !lastMessage || lastMessage.type !== "completed") {
      setSaveError("No trained model available to save");
      return;
    }

    if (!modelName.trim()) {
      setSaveError("Model name is required");
      return;
    }

    if (!userId) {
      setSaveError("User ID not available. Please ensure you are logged in.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // Auto-create playground if it doesn't exist
      let effectivePlaygroundId = playgroundId;
      if (!effectivePlaygroundId) {
        setSaveError("Creating playground for model storage...");
        const playgroundGraph = neuralCanvasToGraphSchema(nodes, edges, {
          name: `Auto-saved from model: ${modelName.trim()}`,
          created_at: new Date().toISOString(),
        });
        const playgroundResult = await createPlayground(playgroundGraph);
        if (!playgroundResult?.id) {
          setSaveError("Failed to create playground for model storage");
          setIsSaving(false);
          return;
        }
        effectivePlaygroundId = playgroundResult.id;
        setSaveError(null);
        // Notify parent that playground was created
        onPlaygroundCreated?.(effectivePlaygroundId);
      }

      const finalMetrics = {
        loss: ((lastMessage.final_metrics as Record<string, unknown>)?.loss as number | null) || null,
        accuracy: ((lastMessage.final_metrics as Record<string, unknown>)?.accuracy as number | null) || null,
        history: ((lastMessage.final_metrics as Record<string, unknown>)?.history as Record<string, unknown>[] | undefined),
      };

      const saveRequest = {
        playground_id: effectivePlaygroundId,
        user_id: userId,
        model_name: modelName.trim(),
        description: modelDescription.trim() || undefined,
        model_state_dict_b64: (lastMessage.model_state_dict_b64 as string) || "",
        graph_json: graph,
        training_config: config,
        final_metrics: finalMetrics,
      };

      const result = await saveTrainedModel(saveRequest);
      setSavingSuccess(true);
      setShowSaveDialog(false);
      setModelName("");
      setModelDescription("");

      // Auto-close success message after 3 seconds
      setTimeout(() => {
        setSavingSuccess(false);
      }, 3000);

      console.log("Model saved successfully:", result.model_id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setIsSaving(false);
    }
  }, [graph, lastMessage, modelName, modelDescription, config, playgroundId, userId, nodes, edges, onPlaygroundCreated]);

  useEffect(() => {
    return () => {
      closeWsRef.current?.();
    };
  }, []);

  if (!isOpen) return null;

  const isTraining = status === "running" || status === "starting";

  const inputClass = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] focus:border-[var(--accent)] transition-all";

  return (
    <div
      className={`
        flex flex-col z-30 bg-[var(--surface)] border-[var(--border)]
        ${compact
          ? "absolute top-full right-0 mt-2 w-[360px] max-h-[75vh] rounded-2xl border overflow-hidden shadow-xl"
          : "absolute top-0 right-0 bottom-0 w-[400px] border-l shadow-xl"
        }
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
            <Zap className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Train Model</h2>
            <p className="text-[11px] text-[var(--foreground-muted)]">Configure and run training</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Warnings */}
        {graphError && (
          <div className="rounded-xl bg-[var(--warning-muted)] border border-[var(--warning)]/30 text-[var(--warning)] text-sm p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{graphError}</span>
          </div>
        )}

        {!datasetId && (
          <div className="rounded-xl bg-[var(--warning-muted)] border border-[var(--warning)]/30 text-[var(--warning)] text-sm p-3">
            Select a dataset on the Input block to train.
          </div>
        )}

        {/* Essential settings */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">
              Epochs
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={config.epochs}
              onChange={(e) => setConfig((c) => ({ ...c, epochs: parseInt(e.target.value, 10) || 1 }))}
              className={inputClass}
              title={SETTING_HINTS.epochs}
            />
            <p className="text-[11px] text-[var(--foreground-faint)] mt-1">{SETTING_HINTS.epochs}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">
              Learning Rate
            </label>
            <input
              type="number"
              step="0.0001"
              min={0.00001}
              value={config.learning_rate}
              onChange={(e) => setConfig((c) => ({ ...c, learning_rate: parseFloat(e.target.value) || 0.001 }))}
              className={inputClass}
              title={SETTING_HINTS.learning_rate}
            />
            <p className="text-[11px] text-[var(--foreground-faint)] mt-1">{SETTING_HINTS.learning_rate}</p>
          </div>
        </div>

        {/* Advanced settings toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>{showAdvanced ? "Hide" : "Show"} advanced settings</span>
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
            <div>
              <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">Batch Size</label>
              <input
                type="number"
                min={1}
                value={config.batch_size}
                onChange={(e) => setConfig((c) => ({ ...c, batch_size: parseInt(e.target.value, 10) || 1 }))}
                className={inputClass}
                title={SETTING_HINTS.batch_size}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">Optimizer</label>
              <select
                value={config.optimizer}
                onChange={(e) => setConfig((c) => ({ ...c, optimizer: e.target.value }))}
                className={inputClass}
                title={SETTING_HINTS.optimizer}
              >
                <option value="adam">Adam</option>
                <option value="adamw">AdamW</option>
                <option value="sgd">SGD</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">Train / Validation Split</label>
              <input
                type="number"
                step="0.05"
                min={0.1}
                max={0.99}
                value={config.train_split}
                onChange={(e) => setConfig((c) => ({ ...c, train_split: parseFloat(e.target.value) || 0.8 }))}
                className={inputClass}
                title={SETTING_HINTS.train_split}
              />
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="rounded-xl bg-[var(--danger-muted)] border border-[var(--danger)]/30 text-[var(--danger)] text-sm p-3">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleStart}
            disabled={!!graphError || !datasetId || status === "starting" || status === "running"}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            <Play className="h-4 w-4" />
            {status === "starting" ? "Starting..." : status === "running" ? "Training..." : "Start Training"}
          </button>
          {isTraining && (
            <button
              type="button"
              onClick={handleStop}
              className="px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-hover)] text-sm font-medium transition-all flex items-center gap-2"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          )}
        </div>

        {/* Live training overlay */}
        {status !== "idle" && (
          <LiveTrainingOverlay
            embedded
            status={status}
            metrics={metrics}
            lastMessage={lastMessage}
            totalEpochs={config.epochs}
            totalBatches={totalBatches}
            latestBatch={latestBatch}
          />
        )}

        {showSaveDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-neural-surface border border-neural-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
              <h3 className="text-lg font-semibold text-white font-mono mb-4">Save Trained Model</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 font-mono mb-2">
                    Model Name
                  </label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g., MNIST Classifier v1"
                    className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 font-mono mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={modelDescription}
                    onChange={(e) => setModelDescription(e.target.value)}
                    placeholder="Add notes about this model..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent resize-none"
                  />
                </div>

                {saveError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3 font-mono">
                    {saveError}
                  </div>
                )}

                {savingSuccess && (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/30 text-green-200 text-xs p-3 font-mono">
                    Model saved successfully!
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSaveError(null);
                  }}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-neural-border text-neutral-300 hover:bg-neural-border text-sm font-mono font-semibold disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveModel}
                  disabled={isSaving || !modelName.trim()}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-neural-accent hover:bg-neural-accent-light text-white text-sm font-mono font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? "Saving…" : "Save Model"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
