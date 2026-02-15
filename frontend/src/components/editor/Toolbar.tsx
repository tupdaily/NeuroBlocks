"use client";

import { useGraphStore } from "@/store/graphStore";
import { useTrainingStore } from "@/store/trainingStore";
import { serializeGraph } from "@/lib/serialization";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPlayground, updatePlayground, getPlayground } from "@/lib/supabase/playgrounds";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Toolbar({ playgroundId }: { playgroundId?: string }) {
  const router = useRouter();
  const { nodes, edges, clearGraph } = useGraphStore();
  const { status } = useTrainingStore();
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    message: string;
    total_params?: number;
  } | null>(null);

  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const graph = serializeGraph(nodes, edges);
      const res = await fetch(`${API_BASE}/api/graphs/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(graph),
      });
      const result = await res.json();
      setValidationResult(result);

      if (result.valid && result.shapes) {
        const { updateNodeShape } = useGraphStore.getState();
        for (const [nodeId, shape] of Object.entries(result.shapes)) {
          updateNodeShape(nodeId, shape as number[]);
        }
      }
    } catch {
      setValidationResult({
        valid: false,
        message: "Cannot connect to backend server",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleGetFeedback = async () => {
    setFeedbackLoading(true);
    setFeedback(null);
    try {
      const graph = serializeGraph(nodes, edges);
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(graph),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? res.statusText);
      }
      const data = await res.json();
      setFeedback(data.feedback ?? "");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to get feedback");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleExportJSON = () => {
    const graph = serializeGraph(nodes, edges);
    const blob = new Blob([JSON.stringify(graph, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "model-graph.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (nodes.length === 0) return;
    setSaving(true);
    try {
      let graph;
      if (playgroundId) {
        const row = await getPlayground(playgroundId);
        graph = serializeGraph(nodes, edges, {
          name: row?.name,
          created_at: row?.graph_json?.metadata?.created_at,
        });
        const ok = await updatePlayground(playgroundId, graph);
        if (ok) setValidationResult({ valid: true, message: "Saved" });
      } else {
        graph = serializeGraph(nodes, edges);
        const result = await createPlayground(graph);
        if (result) {
          router.replace(`/playground/${result.id}`);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <header className="h-14 flex-shrink-0 flex items-center px-5 border-b border-[var(--border-muted)] bg-[var(--surface)]/80 backdrop-blur-xl">
      <div className="flex items-center gap-1.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/25">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.25" stroke="white" />
            <rect x="14" y="4" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.25" stroke="white" />
            <rect x="8.5" y="13" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.35" stroke="white" />
            <circle cx="6.5" cy="7.5" r="1" fill="white" /><circle cx="17.5" cy="7.5" r="1" fill="white" /><circle cx="12" cy="16.5" r="1" fill="white" />
          </svg>
        </div>
        <h1 className="font-semibold text-[var(--foreground)] tracking-tight ml-1 text-[15px]" style={{ fontFamily: "var(--font-outfit), var(--font-sans)" }}>
          NeuroBlocks
        </h1>
      </div>

      <div className="flex items-center gap-2 ml-8">
        <button
          onClick={handleSave}
          disabled={saving || nodes.length === 0}
          className="px-4 py-2 rounded-full text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--accent)] transition-all duration-200"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={handleValidate}
          disabled={validating || nodes.length === 0}
          className="px-4 py-2 rounded-full text-sm font-medium bg-[var(--surface-elevated)] text-[var(--foreground-muted)] border border-[var(--border)] hover:bg-[var(--border-muted)] hover:text-[var(--foreground)] hover:border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          {validating ? "Validating…" : "Validate"}
        </button>
        <button
          onClick={handleGetFeedback}
          disabled={feedbackLoading || nodes.length === 0}
          className="px-4 py-2 rounded-full text-sm font-medium bg-[var(--surface-elevated)] text-[var(--foreground-muted)] border border-[var(--border)] hover:bg-[var(--border-muted)] hover:text-[var(--foreground)] hover:border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          {feedbackLoading ? "Getting feedback…" : "Get feedback"}
        </button>
        <button
          onClick={handleExportJSON}
          disabled={nodes.length === 0}
          className="px-4 py-2 rounded-full text-sm font-medium bg-[var(--surface-elevated)] text-[var(--foreground-muted)] border border-[var(--border)] hover:bg-[var(--border-muted)] hover:text-[var(--foreground)] hover:border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          Export JSON
        </button>
        <button
          onClick={clearGraph}
          disabled={nodes.length === 0}
          className="px-4 py-2 rounded-full text-sm font-medium bg-[var(--surface-elevated)] text-[var(--foreground-muted)] border border-[var(--border)] hover:bg-[var(--danger-muted)] hover:text-[var(--danger)] hover:border-[var(--danger)]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          Clear
        </button>
      </div>

      <div className="flex-1" />

      {validationResult && (
        <div
          className={`text-xs px-3 py-1.5 rounded-full font-medium ${
            validationResult.valid
              ? "bg-[var(--success-muted)] text-[var(--success)]"
              : "bg-[var(--danger-muted)] text-[var(--danger)]"
          }`}
        >
          {validationResult.valid
            ? `Valid · ${validationResult.total_params?.toLocaleString()} params`
            : validationResult.message}
        </div>
      )}

      {feedback !== null && (
        <div className="ml-2 max-w-md px-3 py-2 rounded-lg text-xs bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--foreground)]">
          <div className="font-medium mb-1 text-[var(--accent)]">Design feedback</div>
          <div className="whitespace-pre-wrap">{feedback}</div>
        </div>
      )}

      <div className="ml-4 text-xs font-mono text-[var(--foreground-muted)] tabular-nums">
        {nodes.length} blocks · {edges.length} connections
      </div>

      {status === "running" && (
        <div className="ml-4 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
          </span>
          <span className="text-xs font-medium text-[var(--accent)]">
            Training…
          </span>
        </div>
      )}
    </header>
  );
}
