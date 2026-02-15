/**
 * Models API - functions for saving, listing, and running inference on trained models.
 */

import type { GraphSchema, TrainingConfigSchema } from "./trainingApi";

export interface TrainingMetrics {
  loss: number | null;
  accuracy: number | null;
  history?: Array<Record<string, unknown>>;
}

export interface SaveModelRequest {
  playground_id: string;
  user_id: string;
  model_name: string;
  description?: string;
  model_state_dict_b64: string;
  graph_json: GraphSchema;
  training_config: TrainingConfigSchema;
  final_metrics: TrainingMetrics;
}

export interface TrainedModel {
  id: string;
  playground_id: string;
  name: string;
  description?: string;
  final_accuracy: number | null;
  final_loss: number | null;
  created_at: string;
}

export interface InferenceRequest {
  input_tensor: number[][];
}

export interface InferenceResponse {
  output: number[][];
  shape: number[];
  inference_time_ms?: number;
  model_id?: string;
}

function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:8000";
  const origin = window.location.origin;
  // If the app is served from the same host as the API, use relative paths
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return origin.replace(/:3000/, ":8000");
  }
  // Otherwise, assume API is on same origin
  return origin;
}

export async function saveTrainedModel(request: SaveModelRequest): Promise<{ model_id: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/models/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? res.statusText ?? "Failed to save model");
  }

  return res.json();
}

export async function getModel(modelId: string): Promise<Record<string, unknown>> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/models/${modelId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? res.statusText ?? "Failed to get model");
  }

  return res.json();
}

export async function listUserModels(userId: string): Promise<TrainedModel[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/users/${userId}/models`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? res.statusText ?? "Failed to list models");
  }

  const data = await res.json();
  return data.models || [];
}

export async function listPlaygroundModels(playgroundId: string): Promise<TrainedModel[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/playgrounds/${playgroundId}/models`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? res.statusText ?? "Failed to list models");
  }

  const data = await res.json();
  return data.models || [];
}

export async function runInference(
  modelId: string,
  inputData: number[][] | File | string,
  inputType: "image" | "text" | "tensor" = "tensor",
  overrides?: { width?: number; height?: number; channels?: number }
): Promise<InferenceResponse> {
  const base = getApiBase();

  // Handle JSON array format (original endpoint, or pre-processed image/tensor data)
  if (Array.isArray(inputData)) {
    const res = await fetch(`${base}/api/models/${modelId}/infer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input_tensor: inputData,
      } as InferenceRequest),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? res.statusText ?? "Failed to run inference");
    }

    return res.json();
  }

  // Handle file/text formats (new multipart endpoint)
  const formData = new FormData();
  formData.append("input_type", inputType);

  if (inputType === "image" && inputData instanceof File) {
    formData.append("file", inputData);
    if (overrides?.width) formData.append("image_width", String(overrides.width));
    if (overrides?.height) formData.append("image_height", String(overrides.height));
    if (overrides?.channels) formData.append("image_channels", String(overrides.channels));
  } else if (inputType === "text" && typeof inputData === "string") {
    formData.append("text_content", inputData);
  } else if (inputType === "tensor" && inputData instanceof File) {
    formData.append("file", inputData);
  } else {
    throw new Error(`Invalid input data type for ${inputType} input`);
  }

  const res = await fetch(`${base}/api/models/${modelId}/infer/file`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));

    // Handle shape validation errors (400)
    if (res.status === 400 && err.error) {
      const shapeError = err as {
        error: string;
        message: string;
        expected_shape: number[];
        actual_shape: number[];
        suggestion?: string;
      };
      throw new Error(
        `${shapeError.message}\n\nExpected: ${JSON.stringify(shapeError.expected_shape)}\nGot: ${JSON.stringify(shapeError.actual_shape)}${shapeError.suggestion ? `\n\nSuggestion: ${shapeError.suggestion}` : ""}`
      );
    }

    throw new Error(err.detail ?? res.statusText ?? "Failed to run inference");
  }

  return res.json();
}
