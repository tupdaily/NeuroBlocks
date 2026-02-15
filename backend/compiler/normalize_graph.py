"""Normalize incoming graph JSON so backend sees lowercase types and scalar params."""

from __future__ import annotations
from models.schemas import GraphSchema, GraphNode, GraphEdge, GraphMetadata


def _int_param(value, default: int) -> int:
    if value is None:
        return default
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    if isinstance(value, (list, tuple)) and len(value) > 0:
        return _int_param(value[0], default)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return default
    return default


def _normalize_node_type_and_params(node: GraphNode) -> tuple[str, dict]:
    """Return (lowercase_type, normalized_params)."""
    t = (node.type or "").strip().lower()
    p = dict(node.params) if node.params else {}

    # PascalCase from frontend -> lowercase
    type_map = {
        "input": "input",
        "output": "output",
        "linear": "linear",
        "conv2d": "conv2d",
        "maxpool2d": "maxpool2d",
        "maxpool1d": "maxpool1d",
        "flatten": "flatten",
        "activation": "activation",
        "dropout": "dropout",
        "layernorm": "layernorm",
        "batchnorm": "batchnorm",
        "embedding": "embedding",
        "attention": "attention",
        "add": "add",
        "concat": "concat",
        "softmax": "softmax",
        "text_input": "text_input",
        "positional_encoding": "positional_encoding",
        "positional_embedding": "positional_embedding",
    }
    out_type = type_map.get(t, t)

    # Activation block: type "activation" + params.activation -> type "relu"/"gelu"/etc.
    if out_type == "activation":
        act = (p.get("activation") or p.get("function") or "relu")
        if isinstance(act, str):
            act = act.strip().lower()
        if act in ("relu", "gelu", "sigmoid", "tanh"):
            out_type = act
        else:
            out_type = "relu"
        p = {}

    # Input: input_shape or shape -> list of ints as "shape" (backend uses C,H,W or B,C,H,W)
    if out_type == "input":
        shape = p.get("shape")
        if shape is None or not isinstance(shape, list):
            raw = p.get("input_shape")
            if isinstance(raw, list):
                # e.g. [null, 3, 224, 224] -> [3, 224, 224] for backend Conv2d (expects 3D)
                nums = [1 if x is None else int(x) for x in raw if isinstance(x, (int, float)) or x is None]
                if len(nums) == 4 and (raw[0] is None or raw[0] == 1):
                    shape = nums[1:]
                else:
                    shape = nums
            elif isinstance(raw, str):
                shape = [int(x.strip()) for x in raw.split(",") if x.strip().replace("-", "").replace(".", "").isdigit()]
            else:
                shape = [1, 28, 28]
        if shape and isinstance(shape, list):
            p = {**p, "shape": [int(x) for x in shape if isinstance(x, (int, float))]}
        if "shape" not in p or not p["shape"]:
            p["shape"] = [1, 28, 28]

    # Conv2D: kernel_size, stride, padding as scalars; "same" -> int
    if out_type == "conv2d":
        k = _int_param(p.get("kernel_size"), 3)
        s = _int_param(p.get("stride"), 1)
        pad = p.get("padding")
        if isinstance(pad, str) and str(pad).strip().lower() == "same":
            pad = k // 2 if k > 0 else 0
        else:
            pad = _int_param(pad, 0)
        p = {
            **p,
            "kernel_size": k,
            "stride": s,
            "padding": pad,
        }

    # MaxPool2D: kernel_size, stride as scalars (no arrays)
    if out_type == "maxpool2d":
        k = _int_param(p.get("kernel_size"), 2)
        s = _int_param(p.get("stride"), k)
        p = {**p, "kernel_size": k, "stride": s}

    # MaxPool1D: kernel_size, stride as scalars
    if out_type == "maxpool1d":
        k = _int_param(p.get("kernel_size"), 2)
        s = _int_param(p.get("stride"), k)
        p = {**p, "kernel_size": k, "stride": s}

    return (out_type, p)


def _normalize_node_dict(n: dict) -> tuple[str, dict]:
    """Same as _normalize_node_type_and_params but for a plain dict node."""
    t = (n.get("type") or "").strip().lower()
    if t == "maxpool":
        t = "maxpool2d"
    p = dict(n.get("params") or {})

    type_map = {
        "input": "input", "output": "output", "linear": "linear", "conv2d": "conv2d",
        "maxpool2d": "maxpool2d", "maxpool1d": "maxpool1d", "flatten": "flatten", "activation": "activation",
        "dropout": "dropout", "layernorm": "layernorm", "batchnorm": "batchnorm",
        "embedding": "embedding", "attention": "attention", "add": "add", "concat": "concat",
        "softmax": "softmax", "text_input": "text_input",
        "positional_encoding": "positional_encoding", "positional_embedding": "positional_embedding",
    }
    out_type = type_map.get(t, t)

    if out_type == "activation":
        act = (p.get("activation") or p.get("function") or "relu")
        if isinstance(act, str):
            act = act.strip().lower()
        if act in ("relu", "gelu", "sigmoid", "tanh"):
            out_type = act
        else:
            out_type = "relu"
        p = {}

    if out_type == "input":
        shape = p.get("shape")
        if shape is None or not isinstance(shape, list):
            raw = p.get("input_shape")
            if isinstance(raw, list):
                nums = [1 if x is None else int(x) for x in raw if isinstance(x, (int, float)) or x is None]
                if len(nums) == 4 and (raw[0] is None or raw[0] == 1):
                    shape = nums[1:]
                else:
                    shape = nums
            elif isinstance(raw, str):
                shape = [int(x.strip()) for x in raw.split(",") if x.strip().replace("-", "").replace(".", "").isdigit()]
            else:
                shape = [1, 28, 28]
        if shape and isinstance(shape, list):
            p = {**p, "shape": [int(x) for x in shape if isinstance(x, (int, float))]}
        if "shape" not in p or not p["shape"]:
            p["shape"] = [1, 28, 28]

    if out_type == "conv2d":
        k = _int_param(p.get("kernel_size"), 3)
        s = _int_param(p.get("stride"), 1)
        pad = p.get("padding")
        if isinstance(pad, str) and str(pad).strip().lower() == "same":
            pad = k // 2 if k > 0 else 0
        else:
            pad = _int_param(pad, 0)
        p = {**p, "kernel_size": k, "stride": s, "padding": pad}

    if out_type == "maxpool2d":
        k = _int_param(p.get("kernel_size"), 2)
        s = _int_param(p.get("stride"), k)
        p = {**p, "kernel_size": k, "stride": s}

    if out_type == "maxpool1d":
        k = _int_param(p.get("kernel_size"), 2)
        s = _int_param(p.get("stride"), k)
        p = {**p, "kernel_size": k, "stride": s}

    return (out_type, p)


def normalize_graph_dict(graph_dict: dict) -> dict:
    """Normalize a graph given as a plain dict (e.g. from LLM). Returns a new dict.
    Use this when you don't have a GraphSchema instance (avoids Pydantic validation errors).
    """
    nodes = graph_dict.get("nodes") or []
    edges = graph_dict.get("edges") or []
    version = graph_dict.get("version") or "1.0"
    metadata = graph_dict.get("metadata") or {}
    if isinstance(metadata, dict):
        metadata = {
            "name": metadata.get("name") or "Untitled",
            "created_at": metadata.get("created_at") or "",
            "description": metadata.get("description"),
        }
    else:
        metadata = {"name": "Untitled", "created_at": "", "description": None}

    out_nodes = []
    for n in nodes:
        if not isinstance(n, dict) or "id" not in n:
            continue
        out_type, out_params = _normalize_node_dict(n)
        if not out_type:
            continue
        pos = n.get("position")
        if not isinstance(pos, dict):
            pos = {"x": 0, "y": 0}
        out_nodes.append({
            "id": str(n["id"]),
            "type": out_type,
            "params": out_params,
            "position": {"x": float(pos.get("x", 0)), "y": float(pos.get("y", 0))},
        })

    node_ids = {n["id"] for n in out_nodes}
    out_edges = []
    for e in edges:
        if not isinstance(e, dict) or "source" not in e or "target" not in e:
            continue
        src, tgt = str(e["source"]), str(e["target"])
        if src in node_ids and tgt in node_ids:
            out_edges.append({
                "id": str(e.get("id") or f"e-{src}-{tgt}"),
                "source": src,
                "sourceHandle": e.get("sourceHandle", "out"),
                "target": tgt,
                "targetHandle": e.get("targetHandle", "in"),
            })

    return {
        "version": version,
        "nodes": out_nodes,
        "edges": out_edges,
        "metadata": metadata,
    }


def normalize_graph(graph: GraphSchema) -> GraphSchema:
    """Return a new GraphSchema with lowercase node types and normalized params."""
    nodes = []
    for n in graph.nodes:
        out_type, out_params = _normalize_node_type_and_params(n)
        nodes.append(
            GraphNode(
                id=n.id,
                type=out_type,
                params=out_params,
                position=n.position,
            )
        )
    return GraphSchema(
        version=graph.version,
        nodes=nodes,
        edges=graph.edges,
        metadata=graph.metadata,
    )
