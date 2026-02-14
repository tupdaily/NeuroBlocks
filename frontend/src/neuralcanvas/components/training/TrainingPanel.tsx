"use client";

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
  fetchDatasets,
  startTraining,
  openTrainingWebSocket,
  stopTraining,
  type GraphSchema,
  type TrainingConfigSchema,
} from "@/neuralcanvas/lib/trainingApi";
import type { TrainingStatus, EpochMetric, BatchUpdate } from "./types";
import { LiveTrainingOverlay } from "./LiveTrainingOverlay";

interface TrainingPanelProps {
  open: boolean;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
}

const DEFAULT_CONFIG: TrainingConfigSchema = {
  epochs: 10,
  batch_size: 64,
  learning_rate: 0.001,
  optimizer: "adam",
  train_split: 0.8,
};

export function TrainingPanel({ open: isOpen, onClose, nodes, edges }: TrainingPanelProps) {
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
  const closeWsRef = useRef<(() => void) | null>(null);

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
    const datasetId = (document.getElementById("training-dataset") as HTMLSelectElement)?.value;
    if (!datasetId) {
      setError("Select a dataset.");
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
            setLatestBatch({
              epoch: msg.epoch as number,
              batch: msg.batch as number,
              loss: msg.loss as number,
            });
          }
          if (type === "epoch") {
            setLatestBatch(null); // clear batch view once epoch completes
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
  }, [graph, graphError, config]);

  const handleStop = useCallback(() => {
    if (jobId) {
      stopTraining(jobId).catch(() => {});
      closeWsRef.current?.();
    }
    setStatus("stopped");
  }, [jobId]);

  useEffect(() => {
    return () => {
      closeWsRef.current?.();
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[380px] bg-neural-surface border-l border-neural-border shadow-xl flex flex-col z-30">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neural-border">
        <h2 className="text-sm font-semibold text-white font-mono">Training</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neural-border transition-colors"
          aria-label="Close panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {graphError && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs p-3 font-mono">
            {graphError}
          </div>
        )}

        {datasetError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3">
            {datasetError}
            <span className="block mt-1 text-neutral-400">Is the backend running on port 8000?</span>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs font-medium text-neutral-400 font-mono">Dataset</label>
          <select
            id="training-dataset"
            className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent"
            disabled={!!datasetError}
          >
            <option value="">Select dataset</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-400 font-mono">Epochs</label>
            <input
              type="number"
              min={1}
              max={500}
              value={config.epochs}
              onChange={(e) => setConfig((c) => ({ ...c, epochs: parseInt(e.target.value, 10) || 1 }))}
              className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 font-mono">Batch size</label>
            <input
              type="number"
              min={1}
              value={config.batch_size}
              onChange={(e) => setConfig((c) => ({ ...c, batch_size: parseInt(e.target.value, 10) || 1 }))}
              className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 font-mono">Learning rate</label>
            <input
              type="number"
              step="0.0001"
              min={0.00001}
              value={config.learning_rate}
              onChange={(e) => setConfig((c) => ({ ...c, learning_rate: parseFloat(e.target.value) || 0.001 }))}
              className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 font-mono">Optimizer</label>
            <select
              value={config.optimizer}
              onChange={(e) => setConfig((c) => ({ ...c, optimizer: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent"
            >
              <option value="adam">Adam</option>
              <option value="adamw">AdamW</option>
              <option value="sgd">SGD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-400 font-mono">Train split</label>
          <input
            type="number"
            step="0.05"
            min={0.1}
            max={0.99}
            value={config.train_split}
            onChange={(e) => setConfig((c) => ({ ...c, train_split: parseFloat(e.target.value) || 0.8 }))}
            className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3 font-mono">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleStart}
            disabled={!!graphError || status === "starting" || status === "running"}
            className="flex-1 px-4 py-2.5 rounded-lg bg-neural-accent hover:bg-neural-accent-light text-white text-sm font-mono font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === "starting" ? "Starting…" : status === "running" ? "Training…" : "Start training"}
          </button>
          {(status === "running" || status === "starting") && (
            <button
              type="button"
              onClick={handleStop}
              className="px-4 py-2.5 rounded-lg border border-neural-border text-neutral-300 hover:bg-neural-border text-sm font-mono transition-colors"
            >
              Stop
            </button>
          )}
        </div>

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
      </div>
    </div>
  );
}
