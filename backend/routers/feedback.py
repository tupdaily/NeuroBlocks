"""Design feedback on playground graphs via OpenAI."""

import json
import os
import re
from collections import deque

from fastapi import APIRouter

from config import settings
from models.schemas import FeedbackRequest
from compiler.normalize_graph import normalize_graph_dict

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

# Allowed block types (must match frontend BlockType). "MaxPool" normalized to "MaxPool2D".
ALLOWED_NODE_TYPES = frozenset({
    "Input", "InputSpace", "Board", "TextInput", "Output", "Display",
    "Linear", "Conv2D", "LSTM", "Attention", "LayerNorm", "BatchNorm",
    "Activation", "Dropout", "Flatten", "Embedding", "TextEmbedding",
    "PositionalEncoding", "PositionalEmbedding", "Softmax", "Add", "Concat",
    "MaxPool2D", "MaxPool", "MaxPool1D",
})
# Normalized graphs use lowercase types; activation is "relu"/"gelu" etc. Accept both.
ALLOWED_NODE_TYPES_LOWER = frozenset(
    {t.lower() for t in ALLOWED_NODE_TYPES}
    | {"relu", "gelu", "sigmoid", "tanh"}
)

# Source blocks (no incoming edges required); used for connectivity BFS
SOURCE_TYPES = frozenset({"Input", "InputSpace", "Board", "TextInput"})
SOURCE_TYPES_LOWER = frozenset({"input", "inputspace", "board", "textinput"})
# Main model input - graph must have at least one
INPUT_TYPES = frozenset({"Input", "TextInput"})
INPUT_TYPES_LOWER = frozenset({"input", "textinput"})
OUTPUT_TYPES = frozenset({"Output"})
OUTPUT_TYPES_LOWER = frozenset({"output"})
# Sink blocks (no outgoing edges required)
SINK_TYPES = frozenset({"Output", "Display"})
SINK_TYPES_LOWER = frozenset({"output", "display"})

# Layout: horizontal spacing between "layers", same y per layer.
LAYOUT_DX = 420
LAYOUT_DY_ROW = 100

BLOCKS_AND_SHAPES_REFERENCE = """
**Block types and tensor shapes (use these exactly):**

- **Input**: Data input. One input port "in" (optional, for Custom Data or Board). One output. Params: optional input_shape as array of numbers (e.g. [3, 224, 224] for C,H,W; omit batch). Output shape e.g. [B, C, H, W] for images.
- **InputSpace**: Custom data source. No input port. One output. Params: data_type ("image" | "table" | "text" | "webcam"), optional input_shape. Connect output to Input's "in" port for custom training data.
- **Board**: Drawing canvas. No input port. One output. Params: width (8–224), height (8–224). User draws an image; output is resized and connected to Input for custom data.
- **TextInput**: Token IDs for sequences. No input port. One output. Params: batch_size, seq_len. Output shape [B, seq_len].
- **Output**: Model output (e.g. logits). One input port "in". No output. Must have exactly one Output in the graph.
- **Display**: LCD-style display for predictions. One input port "in". No output. Optional; connect to Output or any tensor to show values. Shows no-signal when nothing connected.
- **Linear**: Dense layer. Input: 2D [B, in_features]. Output: 2D [B, out_features]. Params: in_features, out_features.
- **Conv2D**: 2D convolution. Input: 4D [B, C, H, W]. Output: 4D. Params: in_channels, out_channels, kernel_size (integer, e.g. 3), stride (integer, e.g. 1), padding (integer, e.g. 1; do not use "same").
- **MaxPool2D** (or **MaxPool**): 2D max pooling. Input: 4D [B, C, H, W]. Output: 4D. Params: kernel_size (integer, e.g. 2), stride (integer, e.g. 2). Use type "MaxPool2D" or "MaxPool".
- **MaxPool1D**: 1D max pooling. Input: 3D [B, C, L] (e.g. sequence or 1D signal). Output: 3D. Params: kernel_size (integer, e.g. 2), stride (integer, e.g. 2).
- **LSTM**: Recurrent layer. Input: 3D [B, seq, input_size]. Output: 3D. Params: input_size, hidden_size, num_layers.
- **Attention**: Self-attention. Input: 3D [B, seq, embed_dim]. Output: 3D. Params: embed_dim, num_heads.
- **LayerNorm**: Layer norm. Input: any, last dim normalized. Params: normalized_shape.
- **BatchNorm**: Batch norm. Input: 2D/4D. Params: num_features.
- **Activation**: Non-linearity. Input/output same shape. Params: activation = "relu" | "gelu" | "sigmoid" | "tanh".
- **Dropout**: Dropout. Params: p (0–1).
- **Flatten**: Flatten to 2D [B, -1]. No params.
- **Embedding**: Integer IDs → vectors. Input: 2D [B, seq]. Output: 3D [B, seq, embedding_dim]. Params: num_embeddings, embedding_dim.
- **TextEmbedding**: Like Embedding for text. Params: vocab_size, embedding_dim. Pair with TextInput and PositionalEncoding/PositionalEmbedding.
- **PositionalEncoding**: Add sinusoidal positions. Input: 3D [B, seq, d_model]. Params: d_model, max_len.
- **PositionalEmbedding**: Learned positions. Input: 3D [B, seq, d_model]. Params: d_model, max_len.
- **Softmax**: Normalize to probabilities. Params: dim (e.g. -1).
- **Add**: Element-wise sum of two inputs (residual). Two inputs: in_a, in_b. Use sourceHandle "out" → targetHandle "in_a" or "in_b".
- **Concat**: Concatenate two inputs. Two inputs: in_a, in_b. Params: dim.

**Connections:** Each edge has source (node id), target (node id), sourceHandle "out", targetHandle "in" (or "in_a"/"in_b" for Add/Concat). Every block except Input, InputSpace, Board, TextInput must have at least one incoming edge. Every block except Output and Display must have at least one outgoing edge. The graph must be connected: there must be a path from some Input, InputSpace, Board, or TextInput to the Output.
"""


def _build_graph_context(graph: dict) -> str:
    """Build graph description for the LLM context."""
    nodes_summary = []
    for n in graph.get("nodes", []):
        t = n.get("type", "unknown")
        p = n.get("params", {})
        nodes_summary.append(f"- {t}: {json.dumps(p)}")
    graph_desc = "\n".join(nodes_summary)
    edges = graph.get("edges", [])
    edge_desc = ", ".join(f"{e['source']}→{e['target']}" for e in edges[:20])
    if len(edges) > 20:
        edge_desc += f" ... ({len(edges)} total)"
    return f"""Graph:
Nodes:
{graph_desc}

Connections: {edge_desc}"""


def _build_paper_context(paper: str | None, quiz_q: str | None, choices: list[str] | None, correct: str | None) -> str:
    """Build optional paper + quiz context for the LLM."""
    parts = []
    if paper:
        parts.append(
            "**Level task (use this as the primary context):**\n"
            "The user is working on a level with this goal. Use it to guide your feedback. "
            "Do not ask them to 'provide more details' or 'describe the problem'—you already have the task below.\n\n"
            f"{paper}"
        )
    if quiz_q and choices is not None:
        parts.append(f"Current multiple choice question: {quiz_q}")
        parts.append(f"Choices: {', '.join(choices)}")
        if correct:
            parts.append(f"Correct answer: {correct}")
    return "\n\n".join(parts) if parts else ""


def _extract_json_from_response(text: str) -> dict | None:
    """Extract a JSON object from markdown code block (```json ... ``` or ``` ... ```), raw JSON, or embedded JSON in prose."""
    if not text or not text.strip():
        return None
    # 1. Try markdown code block first
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        raw = match.group(1).strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
    # 2. Try parsing the whole message as JSON
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    # 3. Fallback: find the first { and extract a balanced JSON object (handles prose + raw JSON without code block)
    start = text.find("{")
    if start >= 0:
        depth = 0
        for i, c in enumerate(text[start:], start=start):
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    raw = text[start : i + 1]
                    try:
                        return json.loads(raw)
                    except json.JSONDecodeError:
                        break
    return None


def _validate_and_layout_suggested_graph(
    out_nodes: list[dict],
    out_edges: list[dict],
    node_ids: set[str],
) -> tuple[list[dict], str | None]:
    """
    Strong non-AI validation and layout. Returns (nodes_with_positions, error_message).
    If error_message is not None, the graph is invalid and should be rejected.
    """
    # 1. All node types allowed (PascalCase or lowercase after normalization)
    for n in out_nodes:
        t = (n.get("type") or "").strip()
        t_lower = t.lower()
        if t not in ALLOWED_NODE_TYPES and t_lower not in ALLOWED_NODE_TYPES_LOWER:
            return (out_nodes, f"Invalid block type: {t!r}. Use only: {sorted(ALLOWED_NODE_TYPES)}")
    # 2. Every edge source and target must be existing node ids
    for e in out_edges:
        if e["source"] not in node_ids:
            return (out_nodes, f"Edge source {e['source']!r} is not a node id.")
        if e["target"] not in node_ids:
            return (out_nodes, f"Edge target {e['target']!r} is not a node id.")
    # 3. Exactly one Output (PascalCase or lowercase after normalization)
    def _is_output(nd: dict) -> bool:
        t = (nd.get("type") or "").strip()
        return t in OUTPUT_TYPES or t.lower() in OUTPUT_TYPES_LOWER
    def _is_input(nd: dict) -> bool:
        t = (nd.get("type") or "").strip()
        return t in INPUT_TYPES or t.lower() in INPUT_TYPES_LOWER
    def _is_sink(nd: dict) -> bool:
        t = (nd.get("type") or "").strip()
        return t in SINK_TYPES or t.lower() in SINK_TYPES_LOWER
    outputs = [n for n in out_nodes if _is_output(n)]
    if len(outputs) != 1:
        return (out_nodes, "The graph must have exactly one Output block.")
    output_id = outputs[0]["id"]
    # 4. At least one Input or TextInput
    inputs = [n for n in out_nodes if _is_input(n)]
    if not inputs:
        return (out_nodes, "The graph must have at least one Input or TextInput block.")
    # 5. Build adjacency: node_id -> list of (neighbor_id, is_outgoing)
    out_neighbors: dict[str, list[str]] = {nid: [] for nid in node_ids}
    in_neighbors: dict[str, list[str]] = {nid: [] for nid in node_ids}
    for e in out_edges:
        out_neighbors[e["source"]].append(e["target"])
        in_neighbors[e["target"]].append(e["source"])
    # 6. Every non-source node must have at least one incoming edge
    def _is_source(nd: dict) -> bool:
        t = (nd.get("type") or "").strip()
        return t in SOURCE_TYPES or t.lower() in SOURCE_TYPES_LOWER
    for n in out_nodes:
        nid = n["id"]
        if _is_source(n):
            continue
        if not in_neighbors[nid]:
            return (out_nodes, f"Block {n['type']} (id {nid}) has no incoming connection. Every block except Input, InputSpace, Board, TextInput must be connected from upstream.")
    # 7. Every non-sink node must have at least one outgoing edge (Output and Display are sinks)
    for n in out_nodes:
        nid = n["id"]
        if _is_sink(n):
            continue
        if not out_neighbors[nid]:
            return (out_nodes, f"Block {n['type']} (id {nid}) has no outgoing connection. Every block except Output and Display must connect downstream.")
    # 8. Connected: from any source (no incoming edges) we can reach the output (BFS)
    source_ids = {nid for nid in node_ids if not in_neighbors[nid]}
    q = deque(source_ids)
    seen = set(source_ids)
    while q:
        cur = q.popleft()
        for adj in out_neighbors[cur]:
            if adj not in seen:
                seen.add(adj)
                q.append(adj)
    if output_id not in seen:
        return (out_nodes, "The graph is not connected: there is no path from any Input/InputSpace/Board/TextInput to the Output.")
    # 9. Every node reachable from some source (no orphans)
    if len(seen) != len(node_ids):
        orphans = node_ids - seen
        return (out_nodes, f"Some blocks are not connected to the flow: {orphans}. All blocks must be reachable from a source (Input, InputSpace, Board, or TextInput).")
    # 10. Assign layout: depth = max(predecessor depths) + 1 so every node is right of all its inputs
    depth: dict[str, int] = {iid: 0 for iid in source_ids}
    changed = True
    while changed:
        changed = False
        for nid in node_ids:
            if nid in depth:
                continue
            preds = in_neighbors[nid]
            if not preds:
                continue
            pred_depths = [depth[p] for p in preds if p in depth]
            if len(pred_depths) == len(preds):
                depth[nid] = max(pred_depths) + 1
                changed = True
    # Any remaining (e.g. from cycles, though we validate connectivity) get max+1
    for nid in node_ids:
        if nid not in depth:
            depth[nid] = max(depth.values(), default=0) + 1
    # Nodes with same depth get same y (align vertically); spread by depth index within same depth
    by_depth: dict[int, list[str]] = {}
    for nid, d in depth.items():
        by_depth.setdefault(d, []).append(nid)
    for d in by_depth:
        by_depth[d].sort()
    max_depth = max(depth.values())
    for n in out_nodes:
        nid = n["id"]
        d = depth.get(nid, 0)
        row_nodes = by_depth.get(d, [nid])
        try:
            idx = row_nodes.index(nid)
        except ValueError:
            idx = 0
        # Same depth = same y; multiple nodes at same depth get slight y offset so they don't overlap
        n["position"] = {
            "x": d * LAYOUT_DX,
            "y": idx * LAYOUT_DY_ROW,
        }
    return (out_nodes, None)


def _validate_suggested_graph(obj: dict) -> tuple[dict | None, str | None]:
    """Validate and layout suggested graph. Returns (graph_dict, error_message).
    If error_message is not None, graph_dict is None and the error should be shown to the user.
    Applies strong validation (all blocks connected, valid types) and layout (horizontal spread, vertical alignment).
    """
    if not isinstance(obj, dict):
        return (None, "Invalid response format.")
    version = obj.get("version")
    nodes = obj.get("nodes")
    edges = obj.get("edges")
    metadata = obj.get("metadata")
    if version is None or not isinstance(nodes, list) or not isinstance(edges, list):
        return (None, "Graph must have version, nodes, and edges.")
    out_nodes = []
    seen_ids: set[str] = set()
    for n in nodes:
        if not isinstance(n, dict) or "id" not in n or "type" not in n:
            continue
        nid = str(n["id"])
        ntype = str(n["type"]).strip()
        if ntype == "MaxPool":
            ntype = "MaxPool2D"
        if nid in seen_ids:
            continue
        seen_ids.add(nid)
        out_nodes.append({
            "id": nid,
            "type": ntype,
            "params": n.get("params") if isinstance(n.get("params"), dict) else {},
            "position": n.get("position") if isinstance(n.get("position"), dict) else {"x": 0, "y": 0},
        })
    out_edges = []
    for e in edges:
        if not isinstance(e, dict) or "source" not in e or "target" not in e:
            continue
        out_edges.append({
            "id": str(e.get("id") or f"e-{e['source']}-{e['target']}"),
            "source": str(e["source"]),
            "sourceHandle": e.get("sourceHandle", "out"),
            "target": str(e["target"]),
            "targetHandle": e.get("targetHandle", "in"),
        })
    if not out_nodes:
        return (None, "Graph has no valid nodes.")
    node_ids = {n["id"] for n in out_nodes}
    # Filter edges to valid node pairs
    out_edges = [e for e in out_edges if e["source"] in node_ids and e["target"] in node_ids]
    # Fix Add/Concat targetHandle when LLM sends "in" instead of in_a/in_b
    type_by_id = {n["id"]: (n.get("type") or "").strip().lower() for n in out_nodes}
    in_port_count: dict[str, int] = {}
    fixed_edges = []
    for e in out_edges:
        tgt = e["target"]
        th = (e.get("targetHandle") or "in").strip()
        if type_by_id.get(tgt) in ("add", "concat") and th not in ("in_a", "in_b"):
            cnt = in_port_count.get(tgt, 0)
            in_port_count[tgt] = cnt + 1
            e = {**e, "targetHandle": "in_a" if cnt == 0 else "in_b"}
        fixed_edges.append(e)
    out_edges = fixed_edges
    out_nodes, err = _validate_and_layout_suggested_graph(out_nodes, out_edges, node_ids)
    if err is not None:
        return (None, err)
    return (
        {
            "version": str(version) if version else "1.0",
            "nodes": out_nodes,
            "edges": out_edges,
            "metadata": {
                "name": (metadata or {}).get("name", "Suggested architecture"),
                "created_at": (metadata or {}).get("created_at", ""),
                "description": (metadata or {}).get("description"),
            }
            if isinstance(metadata, dict)
            else {"name": "Suggested architecture", "created_at": "", "description": None},
        },
        None,
    )


async def _generate_feedback_unified(
    graph: dict,
    messages: list[dict],
    *,
    paper_context: str | None = None,
    quiz_question: str | None = None,
    quiz_choices: list[str] | None = None,
    quiz_correct: str | None = None,
) -> tuple[str, dict | None]:
    """
    Single LLM call: the model decides whether to return text-only feedback or
    text + a suggested graph. Returns (feedback_text, suggested_graph or None).
    """
    api_key = settings.openai_api_key
    if not api_key:
        return (
            "Feedback unavailable: OPENAI_API_KEY not set. "
            "Add it to your backend .env to enable AI feedback.",
            None,
        )

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        full_graph_json = json.dumps(graph, indent=2)
        extra = _build_paper_context(paper_context, quiz_question, quiz_choices, quiz_correct)
        extra_block = f"\n\n{extra}" if extra else ""

        level_instruction = (
            "\n- When a **level task** is provided above, treat it as the main context. "
            "If the user's message is vague (e.g. 'help', 'what do you think?'), give feedback on how their design relates to that task—what matches, what's missing, or what to try next. Do not ask them to describe the problem or provide more details."
        ) if extra else ""

        system_content = f"""You are an expert in deep learning and neural network architecture.
The user is building a neural network in a visual playground. You see their current design as full JSON below.

Current design (full JSON graph):
```json
{full_graph_json}
```
{extra_block}
{BLOCKS_AND_SHAPES_REFERENCE}

**How to respond:**
{level_instruction}
- **Decide from the user's message** whether they are asking you to *produce a new or revised architecture* (e.g. "design a better one", "improve my model", "suggest a new architecture", "how can I improve", "what would you change") or whether they just want *advice, explanation, or critique* without a full new design.

- **If they want a new/improved architecture designed:** Write a short explanation (1–3 sentences), then output the complete new graph as a single JSON object in a markdown code block.

  **Schema (exact):**
  - "version": "1.0"
  - "nodes": array of {{ "id": string (unique, e.g. "input-1", "linear-2"), "type": string (one of the block types above), "params": object, "position": {{ "x": number, "y": number }} }}
  - "edges": array of {{ "id": string, "source": string (node id), "sourceHandle": "out", "target": string (node id), "targetHandle": "in" (or "in_a"/"in_b" for Add/Concat) }}
  - "metadata": {{ "name": string, "created_at": string, "description": optional string }}

  **Rules (strict):**
  1. Use only the block types listed in the reference above. For Activation use params {{ "activation": "relu" }} or "gelu", "sigmoid", "tanh". For Linear use "in_features" and "out_features".
  2. **Param format:** Use plain numbers for Conv2D, MaxPool2D, and MaxPool1D (e.g. kernel_size: 3, stride: 1, padding: 1 for Conv2D). Do NOT use arrays like [3, 3] or the string "same" for padding. For Input use input_shape as an array of numbers, e.g. [3, 224, 224].
  3. **Every block must be connected:** Exactly one Output; at least one Input or TextInput; every other block must have at least one incoming edge and at least one outgoing edge; there must be a path from some Input/TextInput to the Output. No orphan blocks.
  4. **Layout:** Spread blocks horizontally (position.x increases along the data flow, e.g. 0, 420, 840, ...) and align vertically (blocks in the same "layer" can share the same position.y). Positions will be auto-corrected if needed, but provide sensible x,y so the flow is left-to-right.

- **If they only want feedback or discussion:** Respond with concise, actionable text only. Do not include any JSON code block or graph."""

        api_messages = [{"role": "system", "content": system_content}]
        api_messages.extend([{"role": m["role"], "content": m["content"]} for m in messages])

        response = await client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=api_messages,
            max_tokens=2000,
        )
        text = (response.choices[0].message.content or "").strip()
        if not text:
            return "No feedback generated.", None

        suggested = _extract_json_from_response(text)
        suggested_graph = None
        validation_error = None
        if suggested:
            # Normalize first so params are scalars and types lowercase; then validate.
            normalized = normalize_graph_dict(suggested)
            validated, validation_error = _validate_suggested_graph(normalized)
            # Use validated graph (with layout) when validation succeeds; otherwise normalized.
            suggested_graph = validated if validated is not None else normalized

        # When the model returned JSON, never show raw JSON — strip the code block and show short message.
        display_text = text
        if suggested and "```" in text:
            display_text = re.sub(r"\s*```(?:json)?\s*[\s\S]*?```\s*", "\n\n", text).strip()
            display_text += "\n\nI've added the suggested architecture below your design. You can move or edit the new blocks."

        return display_text, suggested_graph
    except Exception as e:
        return f"Error generating feedback: {str(e)}", None


@router.post("")
async def get_feedback(req: FeedbackRequest) -> dict:
    """
    Chat about the playground graph design. Accepts graph + message history.
    The model decides whether the user wants a new architecture (returns suggested_graph)
    or just text feedback. Optional paper/quiz context for walkthroughs.
    Set OPENAI_API_KEY in your environment.
    """
    graph_dict = req.graph.model_dump()
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    feedback, suggested_graph = await _generate_feedback_unified(
        graph_dict,
        messages,
        paper_context=req.paper_context,
        quiz_question=req.quiz_question,
        quiz_choices=req.quiz_choices,
        quiz_correct=req.quiz_correct,
    )
    result: dict = {"feedback": feedback}
    if suggested_graph is not None:
        result["suggested_graph"] = normalize_graph_dict(suggested_graph)
    return result
