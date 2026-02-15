"""
Shape validation for model inference inputs.

Validates that user-provided input tensors match the model's expected input shape.
"""

from typing import Tuple, Dict, Any, Optional


def validate_input_shape(
    actual_shape: Tuple[int, ...],
    expected_shape: Tuple[int, ...],
    model_id: str = "unknown",
) -> Dict[str, Any]:
    """
    Validate if an actual input shape matches the expected shape for a model.

    Rules:
    - First dimension (batch size) is flexible - can be any positive integer
    - All remaining dimensions must match exactly
    - Example: expected (784,) matches actual (1, 784), (5, 784), etc.
    - Example: expected (784,) does NOT match (500,) or (28, 28)

    Args:
        actual_shape: Shape of the provided input tensor, e.g., (1, 784) or (5, 1536)
        expected_shape: Expected shape from model's input node, e.g., (784,) or (1536,)
        model_id: Model identifier for error messages

    Returns:
        Dictionary with:
        - valid (bool): Whether shapes match
        - actual_shape (list): Provided shape
        - expected_shape (list): Expected shape
        - error (str|None): Error message if invalid, None if valid
        - message (str): User-friendly message
        - suggestion (str|None): Helpful suggestion if invalid
    """

    # Convert to lists for JSON serialization
    actual_list = list(actual_shape)
    expected_list = list(expected_shape)

    # Handle empty shapes
    if len(expected_shape) == 0:
        return {
            "valid": False,
            "actual_shape": actual_list,
            "expected_shape": expected_list,
            "error": "Model has no input shape defined",
            "message": "Cannot validate: model input shape is not configured",
            "suggestion": None,
        }

    if len(actual_shape) == 0:
        return {
            "valid": False,
            "actual_shape": actual_list,
            "expected_shape": expected_list,
            "error": "Provided input has no data",
            "message": "Your input is empty",
            "suggestion": "Please provide at least one sample",
        }

    # Extract batch size (first dimension) - it's flexible
    # Expected shape tells us the feature dimensions
    expected_features = expected_shape  # Full expected shape (may include batch or not)
    actual_batch = actual_shape[0] if len(actual_shape) > 0 else 1
    actual_features = actual_shape[1:] if len(actual_shape) > 1 else (actual_shape[0],)

    # Check if remaining dimensions match
    # Case 1: Expected shape is [features] (no batch), actual is [batch, features]
    if len(expected_shape) == 1 and len(actual_shape) == 2:
        if actual_features[0] == expected_shape[0]:
            return {
                "valid": True,
                "actual_shape": actual_list,
                "expected_shape": expected_list,
                "error": None,
                "message": f"✓ Input shape matches (batch={actual_batch}, features={expected_shape[0]})",
                "suggestion": None,
            }
        else:
            suggestion = (
                f"Try resizing your image to {int(expected_shape[0] ** 0.5)} × {int(expected_shape[0] ** 0.5)} pixels"
                if expected_shape[0] in [784, 3072]
                else "Check that your input has the correct dimensions"
            )
            return {
                "valid": False,
                "actual_shape": actual_list,
                "expected_shape": expected_list,
                "error": f"Feature dimension mismatch: expected {expected_shape[0]}, got {actual_features[0]}",
                "message": f"❌ Input has {actual_features[0]} features, but model expects {expected_shape[0]}",
                "suggestion": suggestion,
            }

    # Case 2: Both have batch dimension
    if len(actual_shape) > 1 and len(expected_shape) > 1:
        if actual_features == expected_shape[1:]:
            return {
                "valid": True,
                "actual_shape": actual_list,
                "expected_shape": expected_list,
                "error": None,
                "message": f"✓ Input shape matches {actual_list}",
                "suggestion": None,
            }
        else:
            return {
                "valid": False,
                "actual_shape": actual_list,
                "expected_shape": expected_list,
                "error": f"Shape mismatch: expected {list(expected_shape)}, got {actual_list}",
                "message": f"❌ Input shape {actual_list} doesn't match expected {list(expected_shape)}",
                "suggestion": "Check the dimensions of your input file",
            }

    # Case 3: Just check if they match after accounting for batch
    if actual_shape == expected_shape:
        return {
            "valid": True,
            "actual_shape": actual_list,
            "expected_shape": expected_list,
            "error": None,
            "message": f"✓ Input shape matches {actual_list}",
            "suggestion": None,
        }

    # Default mismatch
    return {
        "valid": False,
        "actual_shape": actual_list,
        "expected_shape": expected_list,
        "error": f"Shape mismatch: expected {list(expected_shape)}, got {actual_list}",
        "message": f"❌ Input shape {actual_list} doesn't match expected {list(expected_shape)}",
        "suggestion": "Check the dimensions of your input",
    }


def infer_expected_shape_from_input_node(graph_json: Dict[str, Any]) -> Optional[Tuple[int, ...]]:
    """
    Extract expected input shape from a model's graph JSON.

    Looks for the first Input or TextInput node and extracts its shape params.

    Args:
        graph_json: Model graph definition with nodes list

    Returns:
        Tuple of expected shape dimensions, or None if not found
    """

    nodes = graph_json.get("nodes", [])

    for node in nodes:
        node_type = node.get("type", "")
        if node_type in ("Input", "TextInput"):
            params = node.get("params", {})

            # Vision input (image)
            if "shape" in params:
                shape = params["shape"]
                if isinstance(shape, (list, tuple)):
                    # Flatten multi-dim shapes to total features
                    # e.g., [28, 28] → (784,)
                    total = 1
                    for dim in shape:
                        total *= dim
                    return (total,)

            # Text input (sequence)
            if node_type == "TextInput" and "seq_len" in params:
                return (params.get("seq_len", 256),)

    # Default: no shape found
    return None
