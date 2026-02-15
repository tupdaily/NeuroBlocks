from pydantic import BaseModel
from typing import Any


class GraphNode(BaseModel):
    id: str
    type: str
    params: dict[str, Any]
    position: dict[str, float]


class GraphEdge(BaseModel):
    id: str
    source: str
    sourceHandle: str
    target: str
    targetHandle: str


class GraphMetadata(BaseModel):
    name: str
    created_at: str
    description: str | None = None


class GraphSchema(BaseModel):
    version: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    metadata: GraphMetadata


class TrainingConfig(BaseModel):
    epochs: int = 10
    batch_size: int = 64
    learning_rate: float = 0.001
    optimizer: str = "adam"
    train_split: float = 0.8


class TrainingRequest(BaseModel):
    graph: GraphSchema
    dataset_id: str
    training_config: TrainingConfig


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class FeedbackRequest(BaseModel):
    graph: GraphSchema
    messages: list[ChatMessage]  # conversation history
    # Optional context for paper walkthrough: paper description + current quiz
    paper_context: str | None = None
    quiz_question: str | None = None
    quiz_choices: list[str] | None = None
    quiz_correct: str | None = None


class ValidationResult(BaseModel):
    valid: bool
    message: str = "OK"
    shapes: dict[str, list[int]] | None = None
    total_params: int | None = None
    errors: list[dict[str, str]] | None = None


class TrainingMetrics(BaseModel):
    loss: float | None = None
    accuracy: float | None = None
    history: list[dict[str, Any]] | None = None


class SaveModelRequest(BaseModel):
    playground_id: str
    user_id: str
    model_name: str
    description: str | None = None
    model_state_dict_b64: str
    graph_json: GraphSchema
    training_config: TrainingConfig
    final_metrics: TrainingMetrics


class InferenceRequest(BaseModel):
    input_tensor: list[list[float]]  # 2D array: [batch_size, features...]


class InferenceResponse(BaseModel):
    output: list[list[float]]  # 2D array: [batch_size, output_classes...]
    shape: list[int]
    inference_time_ms: float | None = None
    model_id: str | None = None


class ShapeValidationError(BaseModel):
    """Response when input shape doesn't match model's expected shape."""
    error: str  # Technical error message
    message: str  # User-friendly message
    expected_shape: list[int]  # Expected dimensions
    actual_shape: list[int]  # Actual dimensions provided
    suggestion: str | None = None  # Helpful suggestion for fixing
