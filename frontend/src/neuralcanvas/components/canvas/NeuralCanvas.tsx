"use client";

// ---------------------------------------------------------------------------
// NeuralCanvas — main React Flow canvas component
// ---------------------------------------------------------------------------

import {
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

import {
  BLOCK_REGISTRY,
  getBlockDefaults,
  type BlockType,
} from "@/neuralcanvas/lib/blockRegistry";
import { validateConnection } from "@/neuralcanvas/lib/shapeEngine";
import { ShapeProvider, useShapes } from "./ShapeContext";
import { ConnectionWire } from "./ConnectionWire";
import { BlockPalette, DRAG_BLOCK_TYPE } from "./BlockPalette";
import { useUndoRedo } from "@/neuralcanvas/hooks/useUndoRedo";
import {
  PeepInsideProvider,
  usePeepInsideContext,
} from "@/neuralcanvas/components/peep-inside/PeepInsideContext";
import { PeepInsideModal } from "@/neuralcanvas/components/peep-inside/PeepInsideModal";
import { TrainingPanel } from "@/neuralcanvas/components/training/TrainingPanel";
import {
  GradientFlowProvider,
  useGradientFlow,
} from "@/neuralcanvas/components/peep-inside/GradientFlowContext";
import { neuralCanvasToGraphSchema, graphsMatchStructurally } from "@/lib/levelGraphAdapter";
import type { GraphSchema } from "@/types/graph";
import { createPlayground, updatePlayground, getPlayground } from "@/lib/supabase/playgrounds";
import { insertChatMessage, getChatHistory } from "@/lib/supabase/userHistories";
import { getApiBase } from "@/neuralcanvas/lib/trainingApi";
import ReactMarkdown from "react-markdown";
import {
  InputBlock,
  TextInputBlock,
  OutputBlock,
  LinearBlock,
  Conv2DBlock,
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
} from "@/neuralcanvas/components/blocks";

// ---------------------------------------------------------------------------
// Register one node type per block → specific block components
// ---------------------------------------------------------------------------

// Task label shown on canvas for challenges; scales with zoom, coverable by other nodes
const CHALLENGE_TASK_NODE_TYPE = "challengeTask";

function ChallengeTaskNode({ data }: NodeProps<{ task?: string; isPaperLevel?: boolean }>) {
  const task = data?.task?.trim();
  const isPaper = data?.isPaperLevel === true;
  if (!task) return null;
  return (
    <div
      className="text-white font-medium select-none max-w-[320px] leading-snug"
      style={{
        fontSize: 11,
        pointerEvents: "none",
        whiteSpace: isPaper ? "pre-line" : "normal",
      }}
      aria-label={isPaper ? "About this paper" : `Challenge task: ${task}`}
    >
      {isPaper ? (
        <>
          <span className="text-amber-400/90 font-semibold block mb-1">About this paper</span>
          <span className="text-neutral-300 font-normal">{task}</span>
        </>
      ) : (
        <>Task: {task}</>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  Input: InputBlock,
  TextInput: TextInputBlock,
  Output: OutputBlock,
  Linear: LinearBlock,
  Conv2D: Conv2DBlock,
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
  [CHALLENGE_TASK_NODE_TYPE]: ChallengeTaskNode,
};

const edgeTypes: EdgeTypes = {
  shape: ConnectionWire,
};

const defaultEdgeOptions = {
  type: "shape" as const,
  animated: false,
};

// ---------------------------------------------------------------------------
// Initial demo nodes so the canvas isn't empty on first load
// ---------------------------------------------------------------------------

const INITIAL_NODES: Node[] = [
  {
    id: "input-1",
    type: "Input",
    position: { x: 50, y: 200 },
    data: { params: {} },
  },
  {
    id: "flatten-1",
    type: "Flatten",
    position: { x: 300, y: 200 },
    data: { params: {} },
  },
  {
    id: "linear-1",
    type: "Linear",
    position: { x: 550, y: 200 },
    data: { params: { in_features: 784, out_features: 128 } },
  },
  {
    id: "activation-1",
    type: "Activation",
    position: { x: 800, y: 200 },
    data: { params: { activation: "relu" } },
  },
  {
    id: "linear-2",
    type: "Linear",
    position: { x: 1050, y: 200 },
    data: { params: { in_features: 128, out_features: 10 } },
  },
  {
    id: "output-1",
    type: "Output",
    position: { x: 1300, y: 200 },
    data: { params: {} },
  },
];

const INITIAL_EDGES: Edge[] = [
  { id: "e-1", source: "input-1", target: "flatten-1", type: "shape" },
  { id: "e-2", source: "flatten-1", target: "linear-1", type: "shape" },
  { id: "e-3", source: "linear-1", target: "activation-1", type: "shape" },
  { id: "e-4", source: "activation-1", target: "linear-2", type: "shape" },
  { id: "e-5", source: "linear-2", target: "output-1", type: "shape" },
];

// ---------------------------------------------------------------------------
// Inner canvas (needs to be inside ReactFlowProvider via ShapeProvider)
// ---------------------------------------------------------------------------

function CanvasInner({
  initialNodes,
  initialEdges,
  playgroundId,
  playgroundName,
  challengeSolutionGraph,
  challengeLevelNumber,
  onChallengeSuccess,
  isPaperLevel,
}: {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  playgroundId?: string;
  playgroundName?: string;
  challengeSolutionGraph?: GraphSchema | null;
  challengeLevelNumber?: number | null;
  onChallengeSuccess?: (levelNumber: number) => void;
  isPaperLevel?: boolean;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes ?? INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges ?? INITIAL_EDGES);
  const { shapes, recompute } = useShapes();
  const { takeSnapshot, undo, redo } = useUndoRedo();
  const [panOnDrag, setPanOnDrag] = useState(true);
  const [trainingPanelOpen, setTrainingPanelOpen] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const idCounter = useRef(100);
  const reactFlowInstance = useReactFlow();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitResult, setSubmitResult] = useState<"idle" | "correct" | "wrong">("idle");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackMessages, setFeedbackMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [feedbackChatOpen, setFeedbackChatOpen] = useState(false);

  // ── Load chat history from Supabase when playground loads ──
  useEffect(() => {
    if (!playgroundId) return;
    let cancelled = false;
    getChatHistory(playgroundId)
      .then((history) => {
        if (!cancelled) setFeedbackMessages(history);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playgroundId]);

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

  // ── Node deletion ──
  const deleteSelectedNodes = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    takeSnapshot(nodes, edges);
    const ids = new Set(selected.map((n) => n.id));
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
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

  // ── Save to Supabase ──
  const router = useRouter();
  const handleSave = useCallback(async () => {
    if (nodes.length === 0) return;
    setSaveStatus("saving");
    try {
      let metadata: { name?: string; created_at?: string } | undefined;
      const row = playgroundId ? await getPlayground(playgroundId) : null;
      if (row) {
        metadata = {
          name: row.name,
          created_at: (row.graph_json as { metadata?: { created_at?: string } } | undefined)?.metadata?.created_at,
        };
      } else if (playgroundName) {
        metadata = { name: playgroundName };
      }
      const graph = neuralCanvasToGraphSchema(
        nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE),
        edges,
        metadata
      );
      if (playgroundId) {
        const ok = await updatePlayground(
          playgroundId,
          graph,
          row?.name ?? graph.metadata?.name
        );
        setSaveStatus(ok ? "saved" : "error");
        if (ok) setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        const result = await createPlayground(graph);
        if (result) {
          setSaveStatus("saved");
          router.replace(`/playground/${result.id}`);
          setTimeout(() => setSaveStatus("idle"), 1500);
        } else {
          setSaveStatus("error");
        }
      }
    } catch {
      setSaveStatus("error");
    }
  }, [nodes, edges, playgroundId, playgroundName, router]);

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
      if (nodes.length === 0 || !userMessage.trim()) return;
      const trimmed = userMessage.trim();
      const newMessages: { role: "user" | "assistant"; content: string }[] = [
        ...feedbackMessages,
        { role: "user", content: trimmed },
      ];
      setFeedbackMessages(newMessages);
      if (playgroundId) {
        insertChatMessage(playgroundId, "user", trimmed).catch(() => {});
      }
      setFeedbackLoading(true);
      try {
        const row = playgroundId ? await getPlayground(playgroundId) : null;
        const metadata = row
          ? { name: row.name, created_at: (row.graph_json as { metadata?: { created_at?: string } } | undefined)?.metadata?.created_at }
          : undefined;
        const graph = neuralCanvasToGraphSchema(
          nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE),
          edges,
          metadata
        );
        const base = getApiBase();
        const res = await fetch(`${base}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph, messages: newMessages }),
        });
        const data = await res.json().catch(() => ({}));
        let assistantContent: string;
        if (!res.ok) {
          assistantContent = (data.detail ?? res.statusText ?? "Request failed") as string;
        } else {
          assistantContent = data.feedback ?? "No response.";
        }
        setFeedbackMessages((m) => [...m, { role: "assistant", content: assistantContent }]);
        if (playgroundId) {
          insertChatMessage(playgroundId, "assistant", assistantContent).catch(() => {});
        }
      } catch (e) {
        const assistantContent = e instanceof Error ? e.message : "Failed to get feedback.";
        setFeedbackMessages((m) => [...m, { role: "assistant", content: assistantContent }]);
        if (playgroundId) {
          insertChatMessage(playgroundId, "assistant", assistantContent).catch(() => {});
        }
      } finally {
        setFeedbackLoading(false);
      }
    },
    [nodes, edges, playgroundId, feedbackMessages]
  );

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't capture when user is typing in an input.
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Delete / Backspace → remove selected
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
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

      // Space (hold) → temporary selection mode so you can box-select
      if (e.key === " " && e.type === "keydown") {
        e.preventDefault();
        setPanOnDrag(false);
      }
    };

    const keyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setPanOnDrag(true);
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

  return (
    <div className="flex w-full h-full">
      {/* ── Block Palette ── */}
      <BlockPalette />

      {/* ── Canvas ── */}
      <div
        ref={reactFlowWrapper}
        className="flex-1 h-full relative"
        style={{ cursor: panOnDrag ? "grab" : "default" }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        panOnDrag={panOnDrag}
        selectionOnDrag={!panOnDrag}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null} // We handle delete ourselves.
      >
        {/* Subtle dot grid background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1f293766"
        />
        <Controls
          className="!bg-neural-surface !border-neural-border !rounded-lg !shadow-xl [&>button]:!bg-neural-surface [&>button]:!border-neural-border [&>button]:!text-neutral-400 [&>button:hover]:!bg-neural-border"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(11, 15, 26, 0.85)"
          className="!bg-neural-surface !border-neural-border !rounded-lg !shadow-xl"
          pannable
          zoomable
        />
      </ReactFlow>

      {/* ── Top-right toolbar ── */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {challengeSolutionGraph && (
          <SubmitChallengeButton
            onSubmit={handleSubmitChallenge}
            result={submitResult}
            disabled={nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE).length === 0}
          />
        )}
        {!isPaperLevel && (
          <FeedbackButton
            onSend={handleFeedbackSend}
            loading={feedbackLoading}
            disabled={nodes.length === 0}
            messages={feedbackMessages}
            chatOpen={feedbackChatOpen}
            onOpenChat={() => setFeedbackChatOpen(true)}
            onCloseChat={() => setFeedbackChatOpen(false)}
          />
        )}
        <SaveButton
          onSave={handleSave}
          status={saveStatus}
          disabled={nodes.length === 0}
        />
        {challengeLevelNumber == null && (
          <div className="relative">
            <TrainingToggle
              open={trainingPanelOpen}
              onToggle={() => setTrainingPanelOpen((o) => !o)}
            />
            <TrainingPanel
              open={trainingPanelOpen}
              onClose={() => setTrainingPanelOpen(false)}
              nodes={nodes}
              edges={edges}
              compact
            />
          </div>
        )}
      </div>

      {/* ── Bottom bar: keyboard hints + gradient flow toggle ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 rounded-full bg-neural-surface/80 border border-neural-border backdrop-blur text-[10px] font-mono select-none">
        <span className="text-neutral-500 pointer-events-none">⌫ Delete</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">⌘Z Undo</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">⌘⇧Z Redo</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">⌘D Duplicate</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">Drag background to pan</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">Space: box select</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <GradientFlowToggle nodeIds={nodes.map((n) => n.id)} />
      </div>
      </div>

      {/* ── Peep Inside Modal ── */}
      <PeepInsideOverlay />
    </div>
  );
}

// ── Feedback button + chat panel ──
function FeedbackButton({
  onSend,
  loading,
  disabled,
  messages,
  chatOpen,
  onOpenChat,
  onCloseChat,
}: {
  onSend: (text: string) => void;
  loading: boolean;
  disabled: boolean;
  messages: { role: "user" | "assistant"; content: string }[];
  chatOpen: boolean;
  onOpenChat: () => void;
  onCloseChat: () => void;
}) {
  const [input, setInput] = useState("");

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
    <>
      <button
        type="button"
        onClick={chatOpen ? onCloseChat : onOpenChat}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-full
          border backdrop-blur text-[10px] font-mono font-semibold
          transition-all duration-200 select-none
          ${
            disabled
              ? "bg-neural-surface/50 border-neural-border text-neutral-600 cursor-not-allowed"
              : chatOpen
                ? "bg-neural-accent/20 border-neural-accent/50 text-neural-accent-light"
                : "bg-neural-surface/80 border-neural-border text-neutral-300 hover:text-white hover:border-neutral-500"
          }
        `}
        title={disabled ? "Add blocks for feedback" : "Chat about your design"}
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
        </svg>
        Feedback
      </button>

      {chatOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40"
            onClick={onCloseChat}
            aria-hidden="true"
          />
          <div
            className="fixed bottom-4 right-4 w-[360px] max-h-[480px] rounded-2xl bg-neural-surface/95 border border-neural-border/80 shadow-2xl backdrop-blur-xl z-50 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neural-border/60 shrink-0">
              <span className="text-sm font-semibold text-white font-mono">Design feedback</span>
              <button
                onClick={onCloseChat}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neural-border/50 transition-colors"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {messages.map((msg, i) =>
                msg.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-neural-accent/20 border border-neural-accent/30 text-xs text-neutral-200">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[85%] px-3 py-2.5 rounded-2xl rounded-bl-md bg-neural-bg/80 border border-neural-border/50 text-xs text-neutral-300 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1 [&_strong]:font-semibold [&_strong]:text-neutral-200 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-white/10 [&_code]:text-[11px]">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-2">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-neutral-200">{children}</strong>,
                          code: ({ children }) => <code className="px-1 py-0.5 rounded bg-white/10 text-[11px] font-mono">{children}</code>,
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
                  <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-md bg-neural-border/30 text-xs text-neutral-400 flex items-center gap-2">
                    <span className="animate-pulse">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="p-3 border-t border-neural-border/60 shrink-0">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your design..."
                rows={1}
                disabled={loading || disabled}
                className="w-full px-3 py-2 rounded-xl bg-neural-bg border border-neural-border text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neural-accent resize-none disabled:opacity-50"
              />
              <p className="mt-1 text-[10px] text-neutral-500 font-mono">Press Enter to send</p>
            </form>
          </div>
        </>
      )}
    </>
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
        border backdrop-blur text-[10px] font-mono font-semibold
        transition-all duration-200 select-none
        ${
          result === "correct"
            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
            : result === "wrong"
              ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
              : disabled
                ? "bg-neural-surface/50 border-neural-border text-neutral-600 cursor-not-allowed"
                : "bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25 hover:border-amber-500/50"
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
        border backdrop-blur text-[10px] font-mono font-semibold
        transition-all duration-200 select-none
        ${
          status === "saved"
            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
            : status === "error"
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : disabled || status === "saving"
                ? "bg-neural-surface/50 border-neural-border text-neutral-600 cursor-not-allowed"
                : "bg-neural-surface/80 border-neural-border text-neutral-300 hover:text-white hover:border-neutral-500"
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
        border backdrop-blur text-[10px] font-mono font-semibold
        transition-all duration-200 select-none
        ${
          open
            ? "bg-neural-accent/20 border-neural-accent/50 text-neural-accent-light shadow-[0_0_20px_rgba(139,92,246,0.15)]"
            : "bg-neural-surface/80 border-neural-border text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
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

// ── Gradient flow toggle button ──
function GradientFlowToggle({ nodeIds }: { nodeIds: string[] }) {
  const { enabled, setEnabled, seedDemo, gradients } = useGradientFlow();

  const handleToggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    // Seed demo data if no real gradient data exists yet.
    if (next && gradients.size === 0 && nodeIds.length > 0) {
      seedDemo(nodeIds);
    }
  }, [enabled, setEnabled, seedDemo, gradients.size, nodeIds]);

  return (
    <button
      onClick={handleToggle}
      className={`
        flex items-center gap-2 px-2.5 py-1 rounded-full
        border backdrop-blur text-[10px] font-mono font-semibold
        transition-all duration-200 select-none
        ${
          enabled
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.15)]"
            : "bg-neural-surface/80 border-neural-border text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
        }
      `}
      title={enabled ? "Hide gradient flow overlay" : "Show gradient flow overlay on canvas"}
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
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
      {enabled ? "Gradient Flow ON" : "Show Gradient Flow"}
    </button>
  );
}

// ── Renders the modal when a block is being peeped ──
function PeepInsideOverlay() {
  const { target, close } = usePeepInsideContext();
  if (!target) return null;
  return (
    <PeepInsideModal
      blockId={target.blockId}
      blockType={target.blockType}
      anchorX={target.anchorX}
      anchorY={target.anchorY}
      activationType={target.activationType}
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
        <PeepInsideProvider>
          <GradientFlowProvider>
            <div className="w-full h-full min-h-0 bg-neural-bg">
              <CanvasInner
                initialNodes={effectiveInitialNodes}
                initialEdges={initialEdges}
                playgroundId={playgroundId}
                playgroundName={playgroundName}
                challengeSolutionGraph={challengeSolutionGraph}
                challengeLevelNumber={challengeLevelNumber}
                onChallengeSuccess={onChallengeSuccess}
                isPaperLevel={isPaperLevel}
              />
            </div>
          </GradientFlowProvider>
        </PeepInsideProvider>
      </ShapeProvider>
    </ReactFlowProvider>
  );
}
