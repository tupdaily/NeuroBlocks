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
