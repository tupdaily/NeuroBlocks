"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listPlaygroundModels,
  runInference,
  getModel,
  type TrainedModel,
  type InferenceResponse,
} from "@/neuralcanvas/lib/modelsApi";

interface InferencePanelProps {
  open: boolean;
  onClose: () => void;
  playgroundId: string;
}

export function InferencePanel({ open: isOpen, onClose, playgroundId }: InferencePanelProps) {
  const [models, setModels] = useState<TrainedModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelDetails, setModelDetails] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inference state
  const [inputTensor, setInputTensor] = useState("");
  const [running, setRunning] = useState(false);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [inferenceResult, setInferenceResult] = useState<InferenceResponse | null>(null);

  // Load models when panel opens
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);
    setSelectedModelId(null);
    setModelDetails(null);

    listPlaygroundModels(playgroundId)
      .then((loadedModels) => {
        setModels(loadedModels);
        if (loadedModels.length === 0) {
          setError("No trained models found for this playground. Train a model first!");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load models");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, playgroundId]);

  // Load model details when selected
  useEffect(() => {
    if (!selectedModelId) {
      setModelDetails(null);
      return;
    }

    setLoading(true);
    getModel(selectedModelId)
      .then((details) => {
        setModelDetails(details);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load model details");
        setModelDetails(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedModelId]);

  const handleRunInference = useCallback(async () => {
    if (!selectedModelId) {
      setInferenceError("Please select a model");
      return;
    }

    if (!inputTensor.trim()) {
      setInferenceError("Please provide input tensor");
      return;
    }

    setRunning(true);
    setInferenceError(null);
    setInferenceResult(null);

    try {
      // Parse input tensor from JSON string
      let parsedInput: number[][];
      try {
        parsedInput = JSON.parse(inputTensor);
        if (!Array.isArray(parsedInput) || !Array.isArray(parsedInput[0])) {
          throw new Error("Input must be a 2D array");
        }
      } catch {
        throw new Error("Invalid input format. Please provide a valid 2D array as JSON");
      }

      const result = await runInference(selectedModelId, parsedInput);
      setInferenceResult(result);
      setInferenceError(null);
    } catch (err) {
      setInferenceError(err instanceof Error ? err.message : "Failed to run inference");
    } finally {
      setRunning(false);
    }
  }, [selectedModelId, inputTensor]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[420px] bg-neural-surface border-l border-neural-border shadow-xl z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neural-border">
        <h2 className="text-sm font-semibold text-white font-mono">Model Inference</h2>
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Model Selection */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 font-mono mb-2">Select Model</label>
          {loading && !models.length ? (
            <div className="text-xs text-neutral-400 font-mono">Loading models...</div>
          ) : (
            <select
              value={selectedModelId || ""}
              onChange={(e) => setSelectedModelId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent"
            >
              <option value="">Choose a model</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.final_accuracy?.toFixed(3) || "?"})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3 font-mono">
            {error}
          </div>
        )}

        {/* Model Details */}
        {modelDetails && (
          <div className="rounded-lg bg-neural-bg border border-neural-border p-3 space-y-2">
            <div className="text-xs font-mono">
              <div className="text-neutral-400">Name: <span className="text-white">{modelDetails.name}</span></div>
              {modelDetails.description && (
                <div className="text-neutral-400 mt-1">Desc: <span className="text-white text-xs">{modelDetails.description}</span></div>
              )}
              {modelDetails.final_loss !== null && (
                <div className="text-neutral-400 mt-1">Loss: <span className="text-white">{Number(modelDetails.final_loss).toFixed(4)}</span></div>
              )}
              {modelDetails.final_accuracy !== null && (
                <div className="text-neutral-400 mt-1">Accuracy: <span className="text-white">{Number(modelDetails.final_accuracy).toFixed(4)}</span></div>
              )}
            </div>
          </div>
        )}

        {/* Input Tensor */}
        {selectedModelId && (
          <>
            <div>
              <label className="block text-xs font-medium text-neutral-400 font-mono mb-2">
                Input Tensor (JSON format)
              </label>
              <textarea
                value={inputTensor}
                onChange={(e) => setInputTensor(e.target.value)}
                placeholder='e.g., [[0.1, 0.2, ...], [0.3, 0.4, ...]]'
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-neural-bg border border-neural-border text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-neural-accent resize-none"
              />
              <p className="text-xs text-neutral-500 mt-1 font-mono">
                Provide a 2D array of floats (batch_size × features)
              </p>
            </div>

            {inferenceError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3 font-mono">
                {inferenceError}
              </div>
            )}

            <button
              type="button"
              onClick={handleRunInference}
              disabled={running || !selectedModelId || !inputTensor.trim()}
              className="w-full px-4 py-2.5 rounded-lg bg-neural-accent hover:bg-neural-accent-light text-white text-sm font-mono font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? "Running inference..." : "Run Inference"}
            </button>

            {/* Results */}
            {inferenceResult && (
              <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3 space-y-2">
                <div className="text-xs font-semibold text-green-200 font-mono">Inference Results</div>
                <div className="space-y-2">
                  <div className="text-xs text-neutral-300 font-mono">
                    <div>Output shape: {JSON.stringify(inferenceResult.shape)}</div>
                    {inferenceResult.inference_time_ms && (
                      <div>Time: {inferenceResult.inference_time_ms.toFixed(2)}ms</div>
                    )}
                  </div>
                  <div className="bg-neural-bg rounded p-2 max-h-32 overflow-y-auto">
                    <pre className="text-xs text-green-200 font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(inferenceResult.output, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
