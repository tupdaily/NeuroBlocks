"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listPlaygroundModels,
  runInference,
  getModel,
  type TrainedModel,
  type InferenceResponse,
} from "@/neuralcanvas/lib/modelsApi";
import { Play, X, AlertTriangle, Zap, Image as ImageIcon, FileText, Database } from "lucide-react";
import { ImageInput } from "./ImageInput";
import { TextInput } from "./TextInput";
import { TensorInput } from "./TensorInput";

type InputType = "image" | "text" | "tensor";

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
  const [activeTab, setActiveTab] = useState<InputType>("image");
  const [imageData, setImageData] = useState<number[] | null>(null);
  const [imageDimensions, setImageDimensions] = useState<[number, number, number] | null>(null);
  const [textInput, setTextInput] = useState("");
  const [selectedTensor, setSelectedTensor] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [inferenceResult, setInferenceResult] = useState<InferenceResponse | null>(null);

  // Calculate expected input shape from model graph
  // Extract the full shape array from the model's Input node (e.g. [3, 28, 28])
  const expectedInputShapeArray = modelDetails ? (() => {
    try {
      const graphJson = modelDetails.graph_json as Record<string, unknown>;
      if (!graphJson || typeof graphJson !== 'object') return null;

      const nodes = graphJson.nodes as Array<Record<string, unknown>>;
      if (!Array.isArray(nodes)) return null;

      const inputNode = nodes.find((n) => (n.type as string).toLowerCase() === "input");
      if (!inputNode) return null;

      const params = inputNode.params as Record<string, unknown>;
      const shapeInfo = params?.shape;

      if (Array.isArray(shapeInfo)) {
        return shapeInfo as number[];
      }

      return null;
    } catch {
      return null;
    }
  })() : null;

  const expectedInputShape = expectedInputShapeArray
    ? expectedInputShapeArray.reduce((a, b) => a * b, 1)
    : null;

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

    let inputData: File | string | number[][] | null = null;

    if (activeTab === "image") {
      if (!imageData) {
        setInferenceError("Please select an image");
        return;
      }
      // Flatten image data to 2D array format expected by backend
      inputData = [imageData];
    } else if (activeTab === "text") {
      if (!textInput.trim()) {
        setInferenceError("Please provide text input");
        return;
      }
      inputData = textInput;
    } else if (activeTab === "tensor") {
      if (!selectedTensor) {
        setInferenceError("Please select a tensor file");
        return;
      }
      inputData = selectedTensor;
    }

    setRunning(true);
    setInferenceError(null);
    setInferenceResult(null);

    try {
      const result = await runInference(selectedModelId, inputData as File | string | number[][], activeTab);
      setInferenceResult(result);
      setInferenceError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to run inference";
      setInferenceError(errorMsg);
    } finally {
      setRunning(false);
    }
  }, [selectedModelId, activeTab, imageData, textInput, selectedTensor]);

  if (!isOpen) return null;

  const inputClass = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] focus:border-[var(--accent)] transition-all";

  return (
    <div className="absolute top-full right-0 mt-2 w-[360px] max-h-[75vh] rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xl z-30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
            <Zap className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Run Inference</h2>
            <p className="text-[11px] text-[var(--foreground-muted)]">Test your trained model</p>
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Model Selection */}
        <div>
          <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">Select Model</label>
          {loading && !models.length ? (
            <div className="text-sm text-[var(--foreground-muted)]">Loading models...</div>
          ) : (
            <select
              value={selectedModelId || ""}
              onChange={(e) => setSelectedModelId(e.target.value || null)}
              className={inputClass + " w-full"}
            >
              <option value="">Choose a model...</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.final_accuracy?.toFixed(2) || "?"})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-[var(--warning-muted)] border border-[var(--warning)]/30 text-[var(--warning)] text-sm p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Model Details */}
        {modelDetails && (
          <div className="rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] p-3 space-y-2">
            <div className="text-xs font-medium text-[var(--foreground-secondary)]">
              {String((modelDetails as Record<string, unknown>).name)}
            </div>
            <div className="text-[11px] text-[var(--foreground-muted)] space-y-1">
              {(modelDetails as Record<string, unknown>).final_accuracy !== null && (
                <div>Accuracy: <span className="text-[var(--foreground)]">{Number((modelDetails as Record<string, unknown>).final_accuracy).toFixed(4)}</span></div>
              )}
              {(modelDetails as Record<string, unknown>).final_loss !== null && (
                <div>Loss: <span className="text-[var(--foreground)]">{Number((modelDetails as Record<string, unknown>).final_loss).toFixed(4)}</span></div>
              )}
            </div>
          </div>
        )}

        {/* Input Selection Tabs */}
        {selectedModelId && (
          <>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-2">
                Input Type
              </label>
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("image");
                    setInferenceError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "image"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-elevated)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <ImageIcon className="h-4 w-4" />
                  Image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("text");
                    setInferenceError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "text"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-elevated)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("tensor");
                    setInferenceError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "tensor"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-elevated)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <Database className="h-4 w-4" />
                  Tensor
                </button>
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === "image" && (
              <ImageInput
                expectedShape={expectedInputShape ? [expectedInputShape] : null}
                expectedShapeArray={expectedInputShapeArray}
                onImageProcessed={(data, shape) => {
                  setImageData(data);
                  setImageDimensions(shape);
                }}
                onError={setInferenceError}
              />
            )}

            {activeTab === "text" && (
              <TextInput
                expectedShape={expectedInputShape ? [expectedInputShape] : null}
                onTextProvided={setTextInput}
                onError={setInferenceError}
              />
            )}

            {activeTab === "tensor" && (
              <TensorInput
                expectedShape={expectedInputShape ? [expectedInputShape] : null}
                onFileSelected={setSelectedTensor}
                onError={setInferenceError}
              />
            )}

            {inferenceError && (
              <div className="rounded-xl bg-[var(--danger-muted)] border border-[var(--danger)]/30 text-[var(--danger)] text-sm p-3">
                {inferenceError}
              </div>
            )}

            <button
              type="button"
              onClick={handleRunInference}
              disabled={
                running ||
                !selectedModelId ||
                (activeTab === "image" && !imageData) ||
                (activeTab === "text" && !textInput.trim()) ||
                (activeTab === "tensor" && !selectedTensor)
              }
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              <Play className="h-4 w-4" />
              {running ? "Running..." : "Run Inference"}
            </button>

            {/* Results */}
            {inferenceResult && (
              <div className="rounded-xl bg-[var(--success-muted)] border border-[var(--success)]/30 p-3 space-y-3">
                <div className="text-sm font-semibold text-[var(--success)]">Results</div>
                <div className="text-[11px] text-[var(--foreground-muted)] space-y-1">
                  <div>Shape: <span className="text-[var(--foreground)]">{JSON.stringify(inferenceResult.shape)}</span></div>
                  {inferenceResult.inference_time_ms && (
                    <div>Time: <span className="text-[var(--foreground)]">{inferenceResult.inference_time_ms.toFixed(2)}ms</span></div>
                  )}
                </div>
                <div className="bg-[var(--surface-elevated)] rounded-lg p-2 max-h-40 overflow-y-auto border border-[var(--border)]">
                  <pre className="text-[10px] text-[var(--foreground-secondary)] font-mono whitespace-pre-wrap break-words">
                    {JSON.stringify(inferenceResult.output, null, 1)}
                  </pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
