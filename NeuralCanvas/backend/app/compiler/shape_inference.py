"""Shape inference: propagate tensor shapes through the graph."""

from __future__ import annotations
import math
from app.models.schemas import GraphSchema
from app.compiler.validator import topological_sort, get_input_node, get_input_nodes


class ShapeError(Exception):
    def __init__(self, message: str, node_id: str | None = None):
        self.message = message
        self.node_id = node_id
        super().__init__(message)


def infer_shapes(
    graph: GraphSchema, input_shape: tuple[int, ...] | None = None
) -> dict[str, list[int]]:
    """Propagate tensor shapes through the graph in topological order.

    Returns a dict of node_id -> output shape (as list of ints).
    """
    nodes_by_id = {n.id: n for n in graph.nodes}
    topo_order = topological_sort(graph)
    shapes: dict[str, list[int]] = {}

    for node_id in topo_order:
        node = nodes_by_id[node_id]
        p = node.params

        if node.type == "input":
            shape = input_shape or tuple(p.get("shape", [1, 28, 28]))
            shapes[node_id] = list(shape)

        elif node.type == "output":
            src = get_input_node(graph, node_id)
            if src and src in shapes:
                shapes[node_id] = shapes[src]

        elif node.type == "linear":
            src = get_input_node(graph, node_id)
            if src is None or src not in shapes:
                raise ShapeError("Linear node has no input", node_id)
            in_shape = shapes[src]
            # Flatten multi-dim input
            in_features = math.prod(in_shape) if len(in_shape) > 1 else in_shape[0]
            out_features = int(p.get("out_features", 128))
            shapes[node_id] = [out_features]

        elif node.type == "conv2d":
            src = get_input_node(graph, node_id)
            if src is None or src not in shapes:
                raise ShapeError("Conv2d node has no input", node_id)
            in_shape = shapes[src]
            if len(in_shape) != 3:
                raise ShapeError(
                    f"Conv2d expects 3D input (C, H, W), got shape {in_shape}",
                    node_id,
                )
            c_in, h_in, w_in = in_shape
            c_out = int(p.get("out_channels", 32))
            k = int(p.get("kernel_size", 3))
            s = int(p.get("stride", 1))
            pad = int(p.get("padding", 0))
            h_out = (h_in + 2 * pad - k) // s + 1
            w_out = (w_in + 2 * pad - k) // s + 1
            if h_out <= 0 or w_out <= 0:
                raise ShapeError(
                    f"Conv2d output dimensions are non-positive: ({c_out}, {h_out}, {w_out})",
                    node_id,
                )
            shapes[node_id] = [c_out, h_out, w_out]

        elif node.type == "maxpool2d":
            src = get_input_node(graph, node_id)
            if src is None or src not in shapes:
                raise ShapeError("MaxPool2d node has no input", node_id)
            in_shape = shapes[src]
            if len(in_shape) != 3:
                raise ShapeError(
                    f"MaxPool2d expects 3D input (C, H, W), got shape {in_shape}",
                    node_id,
                )
            c, h_in, w_in = in_shape
            k = int(p.get("kernel_size", 2))
            s = int(p.get("stride", k))
            h_out = (h_in - k) // s + 1
            w_out = (w_in - k) // s + 1
            if h_out <= 0 or w_out <= 0:
                raise ShapeError(
                    f"MaxPool2d output dimensions are non-positive: ({c}, {h_out}, {w_out})",
                    node_id,
                )
            shapes[node_id] = [c, h_out, w_out]

        elif node.type == "adaptiveavgpool2d":
            src = get_input_node(graph, node_id)
            if src is None or src not in shapes:
                raise ShapeError("AdaptiveAvgPool2d node has no input", node_id)
            in_shape = shapes[src]
            if len(in_shape) != 3:
                raise ShapeError(
                    f"AdaptiveAvgPool2d expects 3D input, got shape {in_shape}",
                    node_id,
                )
            out_size = p.get("output_size", [1, 1])
            shapes[node_id] = [in_shape[0], int(out_size[0]), int(out_size[1])]

        elif node.type == "flatten":
            src = get_input_node(graph, node_id)
            if src is None or src not in shapes:
                raise ShapeError("Flatten node has no input", node_id)
            in_shape = shapes[src]
            shapes[node_id] = [math.prod(in_shape)]

        elif node.type in ("relu", "gelu", "sigmoid", "tanh", "dropout"):
            src = get_input_node(graph, node_id)
            if src is None or src not in shapes:
                raise ShapeError(f"{node.type} node has no input", node_id)
            shapes[node_id] = shapes[src]

        elif node.type in ("batchnorm", "layernorm"):
            src = get_input_node(graph, node_id)
            if src is None or src not in shapes:
                raise ShapeError(f"{node.type} node has no input", node_id)
            shapes[node_id] = shapes[src]

        elif node.type == "add":
            srcs = get_input_nodes(graph, node_id)
            if len(srcs) != 2:
                raise ShapeError("Add node requires exactly 2 inputs", node_id)
            shape_a = shapes.get(srcs[0])
            shape_b = shapes.get(srcs[1])
            if shape_a is None or shape_b is None:
                raise ShapeError("Add node input shapes not available", node_id)
            if shape_a != shape_b:
                raise ShapeError(
                    f"Add node shape mismatch: {shape_a} vs {shape_b}",
                    node_id,
                )
            shapes[node_id] = shape_a

        elif node.type == "concat":
            srcs = get_input_nodes(graph, node_id)
            if len(srcs) < 2:
                raise ShapeError(
                    "Concat node requires at least 2 inputs", node_id
                )
            in_shapes = [shapes.get(s) for s in srcs]
            if any(s is None for s in in_shapes):
                raise ShapeError(
                    "Concat node input shapes not available", node_id
                )
            dim = int(p.get("dim", 0))
            # Validate: all dims except concat dim must match
            reference = in_shapes[0]
            for s in in_shapes[1:]:
                for i, (a, b) in enumerate(zip(reference, s)):  # type: ignore
                    if i != dim and a != b:
                        raise ShapeError(
                            f"Concat shape mismatch at dim {i}: {reference} vs {s}",
                            node_id,
                        )
            # Compute output shape
            result = list(reference)  # type: ignore
            result[dim] = sum(s[dim] for s in in_shapes)  # type: ignore
            shapes[node_id] = result

        else:
            # Unknown node type: pass through shape
            src = get_input_node(graph, node_id)
            if src and src in shapes:
                shapes[node_id] = shapes[src]

    return shapes
