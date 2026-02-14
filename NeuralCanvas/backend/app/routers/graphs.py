"""Graph validation and management endpoints."""

from fastapi import APIRouter, HTTPException
from app.models.schemas import GraphSchema, ValidationResult
from app.compiler.validator import validate_graph, ValidationError
from app.compiler.shape_inference import infer_shapes, ShapeError
from app.compiler.model_builder import build_model, count_parameters
from app.training.datasets import get_dataset_shape

router = APIRouter(prefix="/api/graphs", tags=["graphs"])


@router.post("/validate", response_model=ValidationResult)
async def validate(graph: GraphSchema):
    """Validate a graph and return shape information."""
    try:
        validate_graph(graph)
    except ValidationError as e:
        return ValidationResult(
            valid=False,
            message=e.message,
            errors=[{"node_id": e.node_id or "", "message": e.message}],
        )

    # Infer shapes
    try:
        # Try to detect input shape from input node params
        input_nodes = [n for n in graph.nodes if n.type == "input"]
        input_shape = None
        if input_nodes:
            shape_param = input_nodes[0].params.get("shape")
            if shape_param and isinstance(shape_param, list):
                input_shape = tuple(int(x) for x in shape_param)

        shapes = infer_shapes(graph, input_shape)
    except ShapeError as e:
        return ValidationResult(
            valid=False,
            message=e.message,
            errors=[{"node_id": e.node_id or "", "message": e.message}],
        )

    # Count parameters
    try:
        model = build_model(graph, input_shape)
        total_params = count_parameters(model)
    except Exception as e:
        return ValidationResult(
            valid=False,
            message=f"Model build failed: {str(e)}",
        )

    return ValidationResult(
        valid=True,
        message="OK",
        shapes=shapes,
        total_params=total_params,
    )
