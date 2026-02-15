"use client";

// ---------------------------------------------------------------------------
// NeuralCanvas — main React Flow canvas component
// ---------------------------------------------------------------------------

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  type OnConnect,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { BLOCK_BASE_WIDTH } from "@/neuralcanvas/lib/canvasConstants";
import {
  BLOCK_REGISTRY,
  getBlockDefaults,
  type BlockType,
} from "@/neuralcanvas/lib/blockRegistry";
import { validateConnection, inferInputParamsFromShape } from "@/neuralcanvas/lib/shapeEngine";
import { ShapeProvider, useShapes } from "./ShapeContext";
import { PredictionProvider } from "./PredictionContext";
import { ConnectionWire } from "./ConnectionWire";
import { BlockPalette, DRAG_BLOCK_TYPE } from "./BlockPalette";
import { useUndoRedo } from "@/neuralcanvas/hooks/useUndoRedo";
import {
  PeepInsideProvider,
  usePeepInsideContext,
} from "@/neuralcanvas/components/peep-inside/PeepInsideContext";
import { PeepInsideModal } from "@/neuralcanvas/components/peep-inside/PeepInsideModal";
import { AugmentPreviewModal } from "@/neuralcanvas/components/augment/AugmentPreviewModal";
import { TrainingPanel } from "@/neuralcanvas/components/training/TrainingPanel";
import { InferencePanel } from "@/neuralcanvas/components/inference/InferencePanel";
import { GradientFlowProvider } from "@/neuralcanvas/components/peep-inside/GradientFlowContext";
import { PeepDataProvider } from "@/neuralcanvas/components/peep-inside/PeepDataContext";
import { neuralCanvasToGraphSchema, levelGraphToNeuralCanvas, graphsMatchStructurally, computeTopologicalLayers } from "@/lib/levelGraphAdapter";
import type { GraphSchema } from "@/types/graph";
import { createPlayground, updatePlayground, getPlayground } from "@/lib/supabase/playgrounds";
import { upsertPaperProgress } from "@/lib/supabase/paperProgress";
import { insertChatMessage, getChatHistory } from "@/lib/supabase/userHistories";
import { createClient } from "@/lib/supabase/client";
import { getApiBase } from "@/neuralcanvas/lib/trainingApi";
import ReactMarkdown from "react-markdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Hand, Square } from "lucide-react";
import {
  InputBlock,
  InputSpaceBlock,
  BoardBlock,
  TextInputBlock,
  OutputBlock,
  DisplayBlock,
  LinearBlock,
  Conv2DBlock,
  MaxPool2DBlock,
  MaxPool1DBlock,
  LSTMBlock,
  AttentionBlock,
  LayerNormBlock,
  BatchNormBlock,
  ActivationBlock,
  DropoutBlock,
  FlattenBlock,
  EmbeddingBlock,
  TextEmbeddingBlock,
  PositionalEncodingBlock,
  PositionalEmbeddingBlock,
  SoftmaxBlock,
  AddBlock,
  ConcatBlock,
  AugmentBlock,
} from "@/neuralcanvas/components/blocks";

// ---------------------------------------------------------------------------
// Register one node type per block → specific block components
// ---------------------------------------------------------------------------

// Task label shown on canvas for challenges; scales with zoom, coverable by other nodes
const CHALLENGE_TASK_NODE_TYPE = "challengeTask";

// Suggested architecture from AI: nodes get this prefix; box wraps them with Accept/Decline
const SUGGESTED_PREFIX = "gen-";
/** Estimated height per block for bbox (blocks are auto-height; use a safe upper bound). */
const SUGGESTION_BLOCK_HEIGHT = 140;

const SuggestionContext = React.createContext<{
  pendingSuggestionIds: string[] | null;
  onAcceptSuggestion: () => void;
  onDeclineSuggestion: () => void;
} | null>(null);

function ChallengeTaskNode({ data }: NodeProps<Node<{ task?: string; isPaperLevel?: boolean }>>) {
  const task = data?.task?.trim();
  const isPaper = data?.isPaperLevel === true;
  if (!task) return null;
  return (
    <div
      className="text-[var(--foreground)] font-medium select-none max-w-[320px] leading-snug bg-[var(--surface)]/80 backdrop-blur-sm rounded-xl px-4 py-3 border border-[var(--border)] shadow-sm"
      style={{
        fontSize: 12,
        pointerEvents: "none",
        whiteSpace: isPaper ? "pre-line" : "normal",
      }}
      aria-label={isPaper ? "About this paper" : `Challenge task: ${task}`}
    >
      {isPaper ? (
        <>
          <span className="text-amber-600 font-semibold block mb-1">About this paper</span>
          <span className="text-[var(--foreground-secondary)] font-normal">{task}</span>
        </>
      ) : (
        <>
          <span className="text-[var(--accent)] font-semibold">Task:</span> {task}
        </>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  Input: InputBlock,
  InputSpace: InputSpaceBlock,
  Board: BoardBlock,
  TextInput: TextInputBlock,
  Output: OutputBlock,
  Display: DisplayBlock,
  Linear: LinearBlock,
  Conv2D: Conv2DBlock,
  MaxPool2D: MaxPool2DBlock,
  MaxPool1D: MaxPool1DBlock,
  LSTM: LSTMBlock,
  Attention: AttentionBlock,
  LayerNorm: LayerNormBlock,
  BatchNorm: BatchNormBlock,
  Activation: ActivationBlock,
  Dropout: DropoutBlock,
  Flatten: FlattenBlock,
  Embedding: EmbeddingBlock,
  TextEmbedding: TextEmbeddingBlock,
  PositionalEncoding: PositionalEncodingBlock,
  PositionalEmbedding: PositionalEmbeddingBlock,
  Softmax: SoftmaxBlock,
  Add: AddBlock,
  Concat: ConcatBlock,
  Augment: AugmentBlock,
  [CHALLENGE_TASK_NODE_TYPE]: ChallengeTaskNode,
};

const edgeTypes: EdgeTypes = {
  shape: ConnectionWire,
};

const defaultEdgeOptions = {
  type: "shape" as const,
  animated: false,
  selectable: true,
};

// ---------------------------------------------------------------------------
// Initial demo nodes so the canvas isn't empty on first load
// ---------------------------------------------------------------------------

// Spacing chosen so connectors are visible: block width ~220px, gap between blocks ~120px
const INITIAL_NODE_SPACING = 340;
const INITIAL_NODES: Node[] = [
  {
    id: "input-1",
    type: "Input",
    position: { x: 60, y: 200 },
    data: { params: {} },
  },
  {
    id: "flatten-1",
    type: "Flatten",
    position: { x: 60 + INITIAL_NODE_SPACING, y: 200 },
    data: { params: {} },
  },
  {
    id: "linear-1",
    type: "Linear",
    position: { x: 60 + INITIAL_NODE_SPACING * 2, y: 200 },
    data: { params: { in_features: 784, out_features: 128 } },
  },
  {
    id: "activation-1",
    type: "Activation",
    position: { x: 60 + INITIAL_NODE_SPACING * 3, y: 200 },
    data: { params: { activation: "relu" } },
  },
  {
    id: "linear-2",
    type: "Linear",
    position: { x: 60 + INITIAL_NODE_SPACING * 4, y: 200 },
    data: { params: { in_features: 128, out_features: 10 } },
  },
  {
    id: "softmax-1",
    type: "Softmax",
    position: { x: 60 + INITIAL_NODE_SPACING * 5, y: 200 },
    data: { params: {} },
  },
  {
    id: "output-1",
    type: "Output",
    position: { x: 60 + INITIAL_NODE_SPACING * 6, y: 200 },
    data: { params: {} },
  },
];

const INITIAL_EDGES: Edge[] = [
  { id: "e-1", source: "input-1", target: "flatten-1", type: "shape" },
  { id: "e-2", source: "flatten-1", target: "linear-1", type: "shape" },
  { id: "e-3", source: "linear-1", target: "activation-1", type: "shape" },
  { id: "e-4", source: "activation-1", target: "linear-2", type: "shape" },
  { id: "e-5", source: "linear-2", target: "softmax-1", type: "shape" },
  { id: "e-6", source: "softmax-1", target: "output-1", type: "shape" },
];

// ---------------------------------------------------------------------------
// Inner canvas (needs to be inside ReactFlowProvider via ShapeProvider)
// ---------------------------------------------------------------------------

function CanvasInner({
  initialNodes,
  initialEdges,
  playgroundId,
  playgroundName,
  challengeTask,
  challengeSolutionGraph,
  challengeLevelNumber,
  onChallengeSuccess,
  isPaperLevel,
  paperLevelNumber,
  paperStepIndex,
  paperFocusedNodeId,
}: {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  playgroundId?: string;
  playgroundName?: string;
  challengeTask?: string | null;
  challengeSolutionGraph?: GraphSchema | null;
  challengeLevelNumber?: number | null;
  onChallengeSuccess?: (levelNumber: number) => void;
  isPaperLevel?: boolean;
  paperLevelNumber?: number | null;
  paperStepIndex?: number | null;
  paperFocusedNodeId?: string | null;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes ?? INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges ?? INITIAL_EDGES);
  const { shapes, recompute } = useShapes();
  const { takeSnapshot, undo, redo } = useUndoRedo();
  type CanvasTool = "pan" | "select";
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("pan");
  const [spaceKeyHeld, setSpaceKeyHeld] = useState(false);
  // When Pan tool: drag pans (unless Space held). When Select tool: drag draws selection rect.
  const effectivePanOnDrag = canvasTool === "pan" && !spaceKeyHeld;
  const selectionOnDrag = !effectivePanOnDrag;
  const [trainingPanelOpen, setTrainingPanelOpen] = useState(false);
  const [inferencePanelOpen, setInferencePanelOpen] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();
  const [effectivePlaygroundId, setEffectivePlaygroundId] = useState<string | undefined>(playgroundId);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const idCounter = useRef(100);
  const reactFlowInstance = useReactFlow();
  const suggestionAnimationRef = useRef<{
    newNodes: Node[];
    newEdges: Edge[];
    layers: string[][];
  } | null>(null);
  const [suggestionAnimationTrigger, setSuggestionAnimationTrigger] = useState<number | null>(null);
  const [pendingSuggestionIds, setPendingSuggestionIds] = useState<string[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitResult, setSubmitResult] = useState<"idle" | "correct" | "wrong">("idle");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackMessages, setFeedbackMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [feedbackChatOpen, setFeedbackChatOpen] = useState(true);

  // ── Load chat history from Supabase when playground loads ──
  useEffect(() => {
    setEffectivePlaygroundId(playgroundId);
  }, [playgroundId]);

  useEffect(() => {
    if (!effectivePlaygroundId) return;
    let cancelled = false;
    getChatHistory(effectivePlaygroundId)
      .then((history) => {
        if (!cancelled) setFeedbackMessages(history);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [effectivePlaygroundId]);

  // ── Load user ID from Supabase auth session ──
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Animate suggested blocks layer-by-layer (as if dragged from sidebar) ──
  useEffect(() => {
    const pending = suggestionAnimationRef.current;
    if (!pending || suggestionAnimationTrigger === null) return;

    let layerIndex = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const scheduleNext = () => {
      if (layerIndex >= pending.layers.length) {
        suggestionAnimationRef.current = null;
        setSuggestionAnimationTrigger(null);
        return;
      }
      const layerIds = new Set<string>(pending.layers[layerIndex]!);
      const placedIds = new Set(pending.layers.slice(0, layerIndex).flat());
      const nodesToAdd = [...layerIds]
        .map((id: string) => pending.newNodes.find((n: Node) => n.id === id))
        .filter((n): n is Node => !!n)
        .map((n) => ({ ...n, data: { ...n.data, animateFromPalette: true } }));
      const edgesToAdd = pending.newEdges.filter(
        (e) => layerIds.has(e.target) && placedIds.has(e.source)
      );
      // On first layer: clear any existing suggestion (gen-*) to avoid duplicate keys when two networks coexist.
      // Add nodes first so React Flow can measure them before computing edge paths.
      const isFirstLayer = layerIndex === 0;
      setNodes((nds) => {
        const base = isFirstLayer
          ? nds.filter((n) => !String(n.id).startsWith(SUGGESTED_PREFIX))
          : nds;
        return [...base, ...nodesToAdd];
      });
      // Defer edge addition so handle positions are available when ConnectionWire renders.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setEdges((eds) => {
            const base = isFirstLayer
              ? eds.filter((e) => !String(e.id).startsWith(SUGGESTED_PREFIX))
              : eds;
            return [...base, ...edgesToAdd];
          });
        });
      });
      layerIndex++;
      if (layerIndex < pending.layers.length) {
        const t = setTimeout(scheduleNext, 550);
        timeouts.push(t);
      } else {
        suggestionAnimationRef.current = null;
        setSuggestionAnimationTrigger(null);
      }
    };

    const t = setTimeout(scheduleNext, 320);
    timeouts.push(t);
    return () => timeouts.forEach((id) => clearTimeout(id));
  }, [suggestionAnimationTrigger, setNodes, setEdges]);

  // ── Drag-and-drop from palette ──
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const blockType = e.dataTransfer.getData(DRAG_BLOCK_TYPE) as BlockType;
      if (!blockType || !BLOCK_REGISTRY[blockType]) return;

      // Convert screen coords → flow coords.
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      takeSnapshot(nodes, edges);

      const newNode: Node = {
        id: `${blockType}-${idCounter.current++}`,
        type: blockType,
        position,
        data: { params: getBlockDefaults(blockType) },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, nodes, edges, setNodes, takeSnapshot],
  );

  // ── Shape propagation on every change ──
  useEffect(() => {
    recompute(nodes, edges);
  }, [nodes, edges, recompute]);

  // ── Infer input-shape-dependent params from upstream (e.g. Linear in_features from Flatten output) ──
  useEffect(() => {
    const updates = new Map<string, Record<string, number>>();
    for (const node of nodes) {
      if (node.type === CHALLENGE_TASK_NODE_TYPE) continue;
      const result = shapes.get(node.id);
      const inputShape = result?.inputShape ?? null;
      if (!inputShape?.length) continue;
      const inferred = inferInputParamsFromShape(node.type as string, inputShape);
      if (!inferred) continue;
      const params = (node.data?.params ?? {}) as Record<string, number | string>;
      const needsUpdate = Object.entries(inferred).some(([key, value]) => {
        const cur = params[key];
        const num = typeof cur === "number" ? cur : parseInt(String(cur), 10);
        return !Number.isFinite(num) || num !== value;
      });
      if (needsUpdate) updates.set(node.id, inferred);
    }
    if (!updates.size) return;
    setNodes((nds) =>
      nds.map((n) => {
        const patch = updates.get(n.id);
        if (!patch) return n;
        const params = (n.data?.params ?? {}) as Record<string, number | string>;
        return {
          ...n,
          data: { ...n.data, params: { ...params, ...patch } },
        };
      })
    );
  }, [shapes, nodes, setNodes]);

  // ── Sync edge validation with current shapes and params (fixes stale error after user adjusts in_features etc.) ──
  useEffect(() => {
    setEdges((currentEdges) => {
      let changed = false;
      const next = currentEdges.map((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) return edge;
        const sourceShape = shapes.get(edge.source)?.outputShape ?? null;
        const validation = validateConnection(
          {
            id: sourceNode.id,
            type: sourceNode.type ?? "Input",
            data: { params: (sourceNode.data?.params ?? {}) as Record<string, string | number> },
          },
          {
            id: targetNode.id,
            type: targetNode.type ?? "Input",
            data: { params: (targetNode.data?.params ?? {}) as Record<string, string | number> },
          },
          sourceShape,
        );
        const newError = validation.valid ? undefined : (validation.error ?? undefined);
        const prevError = (edge.data?.error as string) || undefined;
        if (prevError === newError) return edge;
        changed = true;
        return { ...edge, data: validation.valid ? {} : { error: validation.error } };
      });
      return changed ? next : currentEdges;
    });
  }, [nodes, shapes, setEdges]);

  // ── Connection handler with validation ──
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;

      // Snapshot before mutation.
      takeSnapshot(nodes, edges);

      const sourceShape = shapes.get(sourceNode.id)?.outputShape ?? null;
      const validation = validateConnection(
        {
          id: sourceNode.id,
          type: sourceNode.type ?? "Input",
          data: { params: (sourceNode.data?.params ?? {}) as Record<string, string | number> },
        },
        {
          id: targetNode.id,
          type: targetNode.type ?? "Input",
          data: { params: (targetNode.data?.params ?? {}) as Record<string, string | number> },
        },
        sourceShape,
      );

      const newEdge: Edge = {
        ...connection,
        id: `e-${Date.now()}`,
        type: "shape",
        data: validation.valid ? {} : { error: validation.error },
      } as Edge;

      setEdges((eds) => addEdge(newEdge, eds));
    },
    [nodes, edges, shapes, setEdges, takeSnapshot],
  );

  // ── Edge deletion (connection only) ──
  const deleteSelectedEdges = useCallback(() => {
    const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);
    if (selectedEdgeIds.length === 0) return false;
    takeSnapshot(nodes, edges);
    const ids = new Set(selectedEdgeIds);
    setEdges((eds) => eds.filter((e) => !ids.has(e.id)));
    return true;
  }, [nodes, edges, setEdges, takeSnapshot]);

  // ── Node deletion ──
  const deleteSelectedNodes = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return false;
    takeSnapshot(nodes, edges);
    const ids = new Set(selected.map((n) => n.id));
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    return true;
  }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

  // ── Duplicate selected node ──
  const duplicateSelectedNode = useCallback(() => {
    const selected = nodes.find((n) => n.selected);
    if (!selected) return;
    takeSnapshot(nodes, edges);
    const newId = `${selected.type}-${idCounter.current++}`;
    const clone: Node = {
      ...structuredClone(selected),
      id: newId,
      position: {
        x: selected.position.x + 40,
        y: selected.position.y + 40,
      },
      selected: false,
    };
    setNodes((nds) => [...nds, clone]);
  }, [nodes, edges, setNodes, takeSnapshot]);

  // ── Save to Supabase (or paper progress when on paper level) ──
  const router = useRouter();
  const handleSave = useCallback(async () => {
    if (isPaperLevel && paperLevelNumber != null && paperStepIndex != null) {
      setSaveStatus("saving");
      const ok = await upsertPaperProgress(paperLevelNumber, paperStepIndex);
      setSaveStatus(ok ? "saved" : "error");
      if (ok) setTimeout(() => setSaveStatus("idle"), 2000);
      return;
    }
    if (nodes.length === 0) return;
    setSaveStatus("saving");
    try {
      let metadata: { name?: string; created_at?: string } | undefined;
      const row = effectivePlaygroundId ? await getPlayground(effectivePlaygroundId) : null;
      if (row) {
        metadata = {
          name: playgroundName?.trim() || row.name,
          created_at: (row.graph_json as { metadata?: { created_at?: string } } | undefined)?.metadata?.created_at,
        };
      } else if (playgroundName?.trim()) {
        metadata = { name: playgroundName.trim() };
      } else {
        metadata = { name: "Untitled" };
      }
      const graph = neuralCanvasToGraphSchema(
        nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE),
        edges,
        metadata
      );
      if (effectivePlaygroundId) {
        const nameToSave = playgroundName?.trim() || row?.name || graph.metadata?.name;
        const ok = await updatePlayground(
          effectivePlaygroundId,
          graph,
          nameToSave
        );
        setSaveStatus(ok ? "saved" : "error");
        if (ok) setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        const result = await createPlayground(graph);
        if (result) {
          setSaveStatus("saved");
          setEffectivePlaygroundId(result.id);
          router.replace(`/playground/${result.id}`);
          setTimeout(() => setSaveStatus("idle"), 1500);
        } else {
          setSaveStatus("error");
        }
      }
    } catch {
      setSaveStatus("error");
    }
  }, [nodes, edges, effectivePlaygroundId, playgroundName, router, isPaperLevel, paperLevelNumber, paperStepIndex]);

  // ── Submit challenge (compare current graph to solution) ──
  const handleSubmitChallenge = useCallback(() => {
    if (!challengeSolutionGraph) return;
    const currentGraph = neuralCanvasToGraphSchema(
      nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE),
      edges,
      { name: "", created_at: "" }
    );
    const match = graphsMatchStructurally(currentGraph, challengeSolutionGraph);
    setSubmitResult(match ? "correct" : "wrong");
    if (match && challengeLevelNumber != null && onChallengeSuccess) {
      onChallengeSuccess(challengeLevelNumber);
    } else if (match) {
      setTimeout(() => setSubmitResult("idle"), 3000);
    }
  }, [nodes, edges, challengeSolutionGraph, challengeLevelNumber, onChallengeSuccess]);

  // Reset "Not quite" when user edits the graph so they can submit again
  useEffect(() => {
    if (submitResult === "wrong") setSubmitResult("idle");
  }, [nodes, edges]);

  // ── Get feedback (chat) ──
  const handleFeedbackSend = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;
      const trimmed = userMessage.trim();
      const newMessages: { role: "user" | "assistant"; content: string }[] = [
        ...feedbackMessages,
        { role: "user", content: trimmed },
      ];
      setFeedbackMessages(newMessages);
      if (effectivePlaygroundId) {
        insertChatMessage(effectivePlaygroundId, "user", trimmed).catch(() => {});
      }
      setFeedbackLoading(true);
      try {
        const row = effectivePlaygroundId ? await getPlayground(effectivePlaygroundId) : null;
        const metadata = row
          ? { name: row.name, created_at: (row.graph_json as { metadata?: { created_at?: string } } | undefined)?.metadata?.created_at }
          : undefined;
        const graph = neuralCanvasToGraphSchema(
          nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE),
          edges,
          metadata
        );
        const base = getApiBase();
        const body: { graph: GraphSchema; messages: typeof newMessages; paper_context?: string } = {
          graph,
          messages: newMessages,
        };
        if (challengeTask?.trim()) body.paper_context = challengeTask.trim();
        const res = await fetch(`${base}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        let assistantContent: string;
        if (!res.ok) {
          assistantContent = (data.detail ?? res.statusText ?? "Request failed") as string;
        } else {
          assistantContent = data.feedback ?? "No response.";
        }
        setFeedbackMessages((m) => [...m, { role: "assistant", content: assistantContent }]);
        if (effectivePlaygroundId) {
          insertChatMessage(effectivePlaygroundId, "assistant", assistantContent).catch(() => {});
        }

        // If the API returned a suggested graph, add it below the user's design with a dashed-border box and Accept/Decline.
        // Animate blocks in layer-by-layer (as if dragged from the sidebar) instead of all at once.
        const suggested = data.suggested_graph as GraphSchema | undefined;
        if (suggested?.nodes?.length && suggested?.edges) {
          let suggestedNodes: Node[];
          let suggestedEdges: Edge[];
          try {
            const converted = levelGraphToNeuralCanvas(suggested);
            suggestedNodes = converted.nodes;
            suggestedEdges = converted.edges;
          } catch (err) {
            console.warn("Failed to decode suggested graph:", err);
            suggestedNodes = [];
            suggestedEdges = [];
          }
          if (suggestedNodes.length > 0 && suggestedEdges.length >= 0) {
          // Use a unique batch suffix so multiple suggestions (or user + suggestion) never collide
          const batchId = Date.now().toString(36);
          const pref = `${SUGGESTED_PREFIX}${batchId}-`;

          const maxY =
            nodes.length === 0
              ? 400
              : Math.max(...nodes.map((n) => n.position.y + SUGGESTION_BLOCK_HEIGHT)) + 80;
          const minSuggestedY = Math.min(...suggestedNodes.map((n) => n.position.y));
          const offsetY = maxY - minSuggestedY;

          const idMap = new Map<string, string>();
          suggestedNodes.forEach((n) => idMap.set(n.id, pref + n.id));

          const newNodes = suggestedNodes.map((n) => ({
            ...n,
            id: idMap.get(n.id) ?? n.id,
            position: { x: n.position.x, y: n.position.y + offsetY },
          }));
          const newEdges = suggestedEdges.map((e) => ({
            ...e,
            id: pref + (e.id ?? `e-${e.source}-${e.target}`),
            source: idMap.get(e.source) ?? e.source,
            target: idMap.get(e.target) ?? e.target,
          }));

          const suggestedIds = newNodes.map((n) => n.id);
          const layers = computeTopologicalLayers(
            suggestedIds,
            newEdges.map((e) => ({ source: e.source, target: e.target }))
          );

          takeSnapshot(nodes, edges);
          setPendingSuggestionIds(suggestedIds);
          suggestionAnimationRef.current = { newNodes, newEdges, layers };
          setSuggestionAnimationTrigger(Date.now());
          }
        }
      } catch (e) {
        const assistantContent = e instanceof Error ? e.message : "Failed to get feedback.";
        setFeedbackMessages((m) => [...m, { role: "assistant", content: assistantContent }]);
        if (effectivePlaygroundId) {
          insertChatMessage(effectivePlaygroundId, "assistant", assistantContent).catch(() => {});
        }
      } finally {
        setFeedbackLoading(false);
      }
    },
    [nodes, edges, playgroundId, feedbackMessages, challengeTask]
  );

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't capture when user is typing in an input.
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Delete / Backspace → remove selected edges first, else selected nodes
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (deleteSelectedEdges()) return;
        deleteSelectedNodes();
        return;
      }

      // Ctrl+Z → undo, Ctrl+Shift+Z → redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          const snapshot = redo(nodes, edges);
          if (snapshot) {
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges);
          }
        } else {
          const snapshot = undo(nodes, edges);
          if (snapshot) {
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges);
          }
        }
        return;
      }

      // Ctrl+D → duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        duplicateSelectedNode();
        return;
      }

      // Space (hold) → temporary selection mode so you can box-select (when Pan tool is active)
      if (e.key === " " && e.type === "keydown") {
        e.preventDefault();
        setSpaceKeyHeld(true);
      }
    };

    const keyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setSpaceKeyHeld(false);
      }
    };

    document.addEventListener("keydown", handler);
    document.addEventListener("keyup", keyUp);
    return () => {
      document.removeEventListener("keydown", handler);
      document.removeEventListener("keyup", keyUp);
    };
  }, [
    nodes,
    edges,
    setNodes,
    setEdges,
    deleteSelectedEdges,
    deleteSelectedNodes,
    duplicateSelectedNode,
    undo,
    redo,
  ]);

  // ── Nodes change handler (snapshot before drag) ──
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      // Snapshot on drag start so undo restores pre-drag position.
      const hasDragStart = changes.some(
        (c) => c.type === "position" && c.dragging,
      );
      if (hasDragStart) {
        takeSnapshot(nodes, edges);
      }
      onNodesChange(changes);
    },
    [onNodesChange, nodes, edges, takeSnapshot],
  );

  // ── MiniMap node color ──
  const minimapNodeColor = useCallback((node: Node) => {
    const blockType = node.type as BlockType;
    return BLOCK_REGISTRY[blockType]?.color ?? "#6366f1";
  }, []);

  const onAcceptSuggestion = useCallback(() => {
    setPendingSuggestionIds(null);
  }, []);

  const onDeclineSuggestion = useCallback(() => {
    if (!pendingSuggestionIds?.length) return;
    const idSet = new Set(pendingSuggestionIds);
    takeSnapshot(nodes, edges);
    setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
    setEdges((eds) =>
      eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target))
    );
    setPendingSuggestionIds(null);
  }, [pendingSuggestionIds, nodes, edges, takeSnapshot, setNodes, setEdges]);

  const suggestionContextValue = useMemo(
    () => ({
      pendingSuggestionIds,
      onAcceptSuggestion,
      onDeclineSuggestion,
    }),
    [pendingSuggestionIds, onAcceptSuggestion, onDeclineSuggestion]
  );

  // Paper mode: zoom out more so blocks and connectors are visible; avoid single-block zoom-in
  const fitViewOptions = isPaperLevel
    ? { padding: 0.65, minZoom: 0.2, maxZoom: 0.85 }
    : { padding: 0.3 };

  // When stepping through MC, zoom fit around the focused layer
  useEffect(() => {
    if (!isPaperLevel || !paperFocusedNodeId) return;
    const opts = { padding: 0.65, minZoom: 0.2, maxZoom: 0.85, duration: 150 };
    const t = setTimeout(() => {
      try {
        reactFlowInstance.fitView({ ...opts, nodes: [{ id: paperFocusedNodeId }] });
      } catch {
        reactFlowInstance.fitView(opts);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [isPaperLevel, paperFocusedNodeId, reactFlowInstance]);

  // When canvas is empty or has one block, use a fixed comfortable zoom so blocks don't appear huge.
  // Only fit view when there are 2+ nodes (so we don't zoom in on a single block).
  const defaultViewport = isPaperLevel ? undefined : { x: 0, y: 0, zoom: 0.72 };
  const shouldFitView = isPaperLevel || nodes.length > 1;

  return (
    <SuggestionContext.Provider value={suggestionContextValue}>
    <div className="flex w-full h-full">
      {/* ── Block Palette ── */}
      <BlockPalette />

      {/* ── Canvas ── */}
      <div
        ref={reactFlowWrapper}
        className="flex-1 h-full relative"
        style={{ cursor: effectivePanOnDrag ? "grab" : "default" }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* ── Canvas tools: Pan / Rectangle select ── */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-md">
        <button
          type="button"
          onClick={() => setCanvasTool("pan")}
          className={`rounded-lg p-2 transition-colors ${
            canvasTool === "pan"
              ? "bg-[var(--accent-muted)] text-[var(--accent)]"
              : "text-[var(--foreground-secondary)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          }`}
          title="Pan (drag to move canvas). Hold Space to temporarily box-select."
          aria-label="Pan tool"
        >
          <Hand size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setCanvasTool("select")}
          className={`rounded-lg p-2 transition-colors ${
            canvasTool === "select"
              ? "bg-[var(--accent-muted)] text-[var(--accent)]"
              : "text-[var(--foreground-secondary)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          }`}
          title="Rectangle select (drag to select all blocks inside)"
          aria-label="Rectangle select tool"
        >
          <Square size={18} strokeWidth={2} className="[stroke-dasharray:4_2]" />
        </button>
      </div>
      <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          panOnDrag={effectivePanOnDrag}
          selectionOnDrag={selectionOnDrag}
          defaultViewport={defaultViewport}
          fitView={shouldFitView}
          fitViewOptions={fitViewOptions}
          onInit={isPaperLevel
            ? (instance) => {
                window.setTimeout(() => {
                  const opts = { padding: 0.65, minZoom: 0.2, maxZoom: 0.85, duration: 150 };
                  if (paperFocusedNodeId) {
                    instance.fitView({ ...opts, nodes: [{ id: paperFocusedNodeId }] });
                  } else {
                    instance.fitView(opts);
                  }
                }, 80);
              }
            : undefined}
          minZoom={isPaperLevel ? 0.2 : 0.15}
          maxZoom={isPaperLevel ? 0.85 : 2.5}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="var(--border-strong)"
          />
          <Controls
            className="!bg-[var(--surface)] !border-[var(--border)] !rounded-xl !shadow-md"
            showInteractive={false}
          />
          <MiniMap
            nodeColor={minimapNodeColor}
            maskColor="var(--background)"
            className="!bg-[var(--surface)] !border-[var(--border)] !rounded-xl !shadow-md"
            pannable
            zoomable
          />
        </ReactFlow>

        {/* ── Top-right toolbar ── */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <ThemeToggle />
        {challengeSolutionGraph && !isPaperLevel && (
          <SubmitChallengeButton
            onSubmit={handleSubmitChallenge}
            result={submitResult}
            disabled={nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE).length === 0}
          />
        )}
        <SaveButton
          onSave={handleSave}
          status={saveStatus}
          disabled={!(isPaperLevel && paperLevelNumber != null && paperStepIndex != null) && nodes.length === 0}
        />
        {challengeLevelNumber == null && (
          <div className="relative">
            <TrainingToggle
              open={trainingPanelOpen}
              onToggle={() => setTrainingPanelOpen((o) => !o)}
            />
            {effectivePlaygroundId && (
              <InferenceToggle
                open={inferencePanelOpen}
                onToggle={() => setInferencePanelOpen((o) => !o)}
              />
            )}
            <TrainingPanel
              open={trainingPanelOpen}
              onClose={() => setTrainingPanelOpen(false)}
              nodes={nodes}
              edges={edges}
              compact
              playgroundId={effectivePlaygroundId}
              userId={userId}
              onPlaygroundCreated={setEffectivePlaygroundId}
            />
            {effectivePlaygroundId && (
              <InferencePanel
                open={inferencePanelOpen}
                onClose={() => setInferencePanelOpen(false)}
                playgroundId={effectivePlaygroundId}
              />
            )}
          </div>
        )}
        </div>

      {/* ── Bottom chat bar (design feedback) ── */}
      {!isPaperLevel && (
        <ChatBar
          onSend={handleFeedbackSend}
          loading={feedbackLoading}
          disabled={false}
          messages={feedbackMessages}
          open={feedbackChatOpen}
          onOpen={() => setFeedbackChatOpen(true)}
          onClose={() => setFeedbackChatOpen(false)}
        />
      )}
      </div>

      {/* ── Peep Inside Modal ── */}
      <PeepInsideOverlay />
    </div>
    </SuggestionContext.Provider>
  );
}

// ── Bottom chat bar (design feedback) ──
function ChatBar({
  onSend,
  loading,
  disabled,
  messages,
  open,
  onOpen,
  onClose,
}: {
  onSend: (text: string) => void;
  loading: boolean;
  disabled: boolean;
  messages: { role: "user" | "assistant"; content: string }[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const suggestionCtx = React.useContext(SuggestionContext);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || loading || disabled) return;
      onSend(text);
      setInput("");
    },
    [input, loading, disabled, onSend]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-40 flex flex-col bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--border)] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] transition-[height] duration-300 ease-out"
      style={{ height: open ? "min(36vh, 280px)" : "52px" }}
    >
      {/* Header bar: click to open when collapsed, or show close when open */}
      {open ? (
        <div className="flex items-center justify-between w-full h-[52px] px-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--accent-muted)] text-[var(--accent)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-[var(--foreground)]">Design feedback</span>
            {messages.length > 0 && (
              <span className="text-[11px] text-[var(--foreground-muted)]">{messages.length} message{messages.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
            aria-label="Close chat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled}
          className={`
            flex items-center justify-between w-full h-[52px] px-4 shrink-0
            transition-colors duration-200 hover:bg-[var(--surface-hover)]/80
            ${disabled ? "opacity-60 cursor-not-allowed" : ""}
          `}
          aria-label="Open design feedback chat"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--surface-elevated)] text-[var(--foreground-secondary)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-[var(--foreground)]">Design feedback</span>
            {messages.length > 0 && (
              <span className="text-[11px] text-[var(--foreground-muted)]">{messages.length} message{messages.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--foreground-muted)]">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {/* Expanded: messages + input */}
      {open && (
        <>
          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3 border-t border-[var(--border)]/80">
            {messages.length === 0 && !loading && (
              <p className="text-xs text-[var(--foreground-muted)] py-2">Ask about your design or get feedback. Add blocks to the canvas first.</p>
            )}
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[65%] px-3 py-2 rounded-2xl rounded-br-md bg-[var(--accent-muted)] border border-[var(--accent-strong)] text-xs text-[var(--foreground)]">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[65%] px-3 py-2.5 rounded-2xl rounded-bl-md bg-[var(--surface-elevated)] border border-[var(--border)] text-xs text-[var(--foreground-secondary)] leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1 [&_strong]:font-semibold [&_strong]:text-[var(--foreground)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-[var(--surface-hover)] [&_code]:text-[11px]">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-2">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-[var(--foreground)]">{children}</strong>,
                        code: ({ children }) => <code className="px-1 py-0.5 rounded bg-[var(--surface-hover)] text-[11px] font-mono">{children}</code>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              )
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[65%] px-3 py-2 rounded-2xl rounded-bl-md bg-[var(--surface-elevated)] text-xs text-[var(--foreground-muted)] flex items-center gap-2">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            {suggestionCtx?.pendingSuggestionIds?.length && (
              <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-[var(--accent-muted)]/50 border border-[var(--accent)]/40">
                <span className="text-xs font-medium text-[var(--foreground)]">Suggested architecture added to canvas</span>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={suggestionCtx.onAcceptSuggestion}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={suggestionCtx.onDeclineSuggestion}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} className="p-3 pt-2 border-t border-[var(--border)] shrink-0 bg-[var(--surface)]">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your design..."
                rows={1}
                disabled={loading || disabled}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)] focus:border-[var(--accent)] resize-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading || disabled}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)] text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                Send
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

// ── Submit challenge button (compare to solution) ──
function SubmitChallengeButton({
  onSubmit,
  result,
  disabled,
}: {
  onSubmit: () => void;
  result: "idle" | "correct" | "wrong";
  disabled: boolean;
}) {
  const label =
    result === "correct"
      ? "Correct!"
      : result === "wrong"
        ? "Not quite"
        : "Submit";
  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={disabled}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full
        border text-[11px] font-medium
        transition-all duration-200 select-none shadow-sm
        ${
          result === "correct"
            ? "bg-[var(--success-muted)] border-[var(--success)] text-[var(--success)]"
            : result === "wrong"
              ? "bg-[var(--warning-muted)] border-[var(--warning)] text-[var(--warning)]"
              : disabled
                ? "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-muted)] cursor-not-allowed opacity-70"
                : "bg-[var(--warning-muted)] border-[var(--warning)] text-[var(--warning)] hover:opacity-80 hover:shadow-md"
        }
      `}
      title={disabled ? "Add blocks to submit" : "Check if your graph matches the solution"}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      {label}
    </button>
  );
}

// ── Save to Supabase button ──
function SaveButton({
  onSave,
  status,
  disabled,
}: {
  onSave: () => void;
  status: "idle" | "saving" | "saved" | "error";
  disabled: boolean;
}) {
  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Save failed"
          : "Save";
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={disabled || status === "saving"}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full
        border text-[11px] font-medium
        transition-all duration-200 select-none shadow-sm
        ${
          status === "saved"
            ? "bg-[var(--success-muted)] border-[var(--success)] text-[var(--success)]"
            : status === "error"
              ? "bg-[var(--danger-muted)] border-[var(--danger)] text-[var(--danger)]"
              : disabled || status === "saving"
                ? "bg-[var(--surface)]/80 border-[var(--border)] text-[var(--foreground-muted)] cursor-not-allowed"
                : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:border-[var(--border-strong)] hover:shadow-md"
        }
      `}
      title={disabled ? "Add blocks to save" : "Save to Supabase"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
      {label}
    </button>
  );
}

// ── Training panel toggle button ──
function TrainingToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full
        border text-[11px] font-medium
        transition-all duration-200 select-none shadow-sm
        ${
          open
            ? "bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--accent)]"
            : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:border-[var(--border-strong)] hover:shadow-md"
        }
      `}
      title={open ? "Close training panel" : "Open training panel"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
      Train
    </button>
  );
}

// ── Inference toggle button ──
function InferenceToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full
        border backdrop-blur text-[10px] font-mono font-semibold
        transition-all duration-200 select-none
        ${
          open
            ? "bg-neural-accent/20 border-neural-accent/50 text-neural-accent-light shadow-[0_0_20px_rgba(139,92,246,0.15)]"
            : "bg-neural-surface/80 border-neural-border text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
        }
      `}
      title={open ? "Close inference panel" : "Open inference panel"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <circle cx="9" cy="10" r="1" />
        <circle cx="12" cy="10" r="1" />
        <circle cx="15" cy="10" r="1" />
      </svg>
      Inference
    </button>
  );
}

// ── Renders the modal when a block is being peeped ──
function PeepInsideOverlay() {
  const { target, close } = usePeepInsideContext();
  const { setNodes, getNodes, getEdges } = useReactFlow();
  if (!target) return null;

  if (target.blockType === "Augment") {
    const color = BLOCK_REGISTRY.Augment?.color ?? "#EA580C";
    const nodes = getNodes();
    const edges = typeof getEdges === "function" ? getEdges() : [];
    // Use the Input node that feeds this Augment block (so dataset_id matches the connected data source)
    const edgeIntoAugment = edges.find((e) => e.target === target.blockId);
    const sourceNode = edgeIntoAugment ? nodes.find((n) => n.id === edgeIntoAugment.source) : null;
    const inputNode = sourceNode?.type === "Input" ? sourceNode : nodes.find((n) => n.type === "Input");
    const raw = (inputNode?.data?.params as Record<string, unknown> | undefined)?.dataset_id;
    const datasetIdStr =
      typeof raw === "string" && raw.trim() && raw !== "__custom__"
        ? raw.trim().toLowerCase()
        : "mnist";
    return (
      <AugmentPreviewModal
        open
        onClose={close}
        blockId={target.blockId}
        initialAugmentations={(target.params?.augmentations as string) ?? "[]"}
        datasetId={datasetIdStr}
        anchorX={target.anchorX}
        anchorY={target.anchorY}
        color={color}
        onSave={(augmentationsJson) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === target.blockId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      params: { ...(n.data?.params as Record<string, unknown>), augmentations: augmentationsJson },
                    },
                  }
                : n
            )
          );
        }}
      />
    );
  }

  return (
    <PeepInsideModal
      blockId={target.blockId}
      blockType={target.blockType}
      anchorX={target.anchorX}
      anchorY={target.anchorY}
      activationType={target.activationType}
      params={target.params}
      onClose={close}
    />
  );
}

// ---------------------------------------------------------------------------
// Exported wrapper (provides ShapeContext)
// ---------------------------------------------------------------------------

const CHALLENGE_TASK_NODE_ID = "challenge-task";

export interface NeuralCanvasProps {
  /** When provided (e.g. from a challenge level), the canvas starts with this graph instead of the default demo. */
  initialNodes?: Node[];
  initialEdges?: Edge[];
  /** When provided, Save updates this playground in Supabase; otherwise Save creates a new one. */
  playgroundId?: string;
  /** Display name for the playground (used when saving). */
  playgroundName?: string;
  /** When provided (e.g. challenge level), a task label is shown on the canvas (scales with zoom, coverable). */
  challengeTask?: string | null;
  /** When true, the task content is shown as "About this paper" with multi-line paper insights instead of "Task:". */
  isPaperLevel?: boolean;
  /** When provided with a challenge, Submit checks current graph against this solution. */
  challengeSolutionGraph?: GraphSchema | null;
  /** Level number for the current challenge; when submit is correct, passed to onChallengeSuccess. */
  challengeLevelNumber?: number | null;
  /** Called when the user submits and the graph matches the solution; use to save completion, show confetti, redirect. */
  onChallengeSuccess?: (levelNumber: number) => void;
  /** When on a paper walkthrough, Save persists this level number and step index. */
  paperLevelNumber?: number | null;
  paperStepIndex?: number | null;
  /** When set, fitView on init centers on this node (for walkthrough zoom on focused layer). */
  paperFocusedNodeId?: string | null;
}

export default function NeuralCanvas({
  initialNodes,
  initialEdges,
  playgroundId,
  playgroundName,
  challengeTask,
  isPaperLevel = false,
  challengeSolutionGraph,
  challengeLevelNumber,
  onChallengeSuccess,
  paperLevelNumber = null,
  paperStepIndex = null,
  paperFocusedNodeId = null,
}: NeuralCanvasProps = {}) {
  const effectiveInitialNodes = useMemo(() => {
    const base = initialNodes ?? INITIAL_NODES;
    // For paper levels, paper info is shown in a separate panel (no overlay on canvas)
    if (isPaperLevel || !challengeTask?.trim()) return base;
    const taskNode: Node = {
      id: CHALLENGE_TASK_NODE_ID,
      type: CHALLENGE_TASK_NODE_TYPE,
      position: { x: 24, y: 24 },
      data: { task: challengeTask.trim(), isPaperLevel: false },
      draggable: false,
      selectable: false,
      connectable: false,
    };
    return [taskNode, ...base];
  }, [initialNodes, challengeTask, isPaperLevel]);

  return (
    <ReactFlowProvider>
      <ShapeProvider>
        <PredictionProvider>
          <PeepDataProvider>
          <PeepInsideProvider>
            <GradientFlowProvider>
            <div className="w-full h-full min-h-0 bg-neural-bg">
              <CanvasInner
                initialNodes={effectiveInitialNodes}
                initialEdges={initialEdges}
                playgroundId={playgroundId}
                playgroundName={playgroundName}
                challengeTask={challengeTask}
                challengeSolutionGraph={challengeSolutionGraph}
                challengeLevelNumber={challengeLevelNumber}
                onChallengeSuccess={onChallengeSuccess}
                isPaperLevel={isPaperLevel}
                paperLevelNumber={paperLevelNumber ?? undefined}
                paperStepIndex={paperStepIndex ?? undefined}
                paperFocusedNodeId={paperFocusedNodeId ?? undefined}
              />
            </div>
            </GradientFlowProvider>
          </PeepInsideProvider>
          </PeepDataProvider>
        </PredictionProvider>
      </ShapeProvider>
    </ReactFlowProvider>
  );
}
