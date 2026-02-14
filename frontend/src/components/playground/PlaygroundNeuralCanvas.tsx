"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getLevelByNumber } from "@/lib/supabase/levels";
import { getPlayground } from "@/lib/supabase/playgrounds";
import { levelGraphToNeuralCanvas } from "@/lib/levelGraphAdapter";
import type { Node, Edge } from "@xyflow/react";

const NeuralCanvas = dynamic(
  () =>
    import("@/neuralcanvas/components/canvas/NeuralCanvas").then((m) => m.default),
  { ssr: false }
);

export default function PlaygroundNeuralCanvas({
  playgroundId,
}: {
  playgroundId?: string;
} = {}) {
  const searchParams = useSearchParams();
  const levelParam = searchParams.get("level");
  const [initialGraph, setInitialGraph] = useState<{
    nodes: Node[];
    edges: Edge[];
  } | null>(null);
  const [playgroundName, setPlaygroundName] = useState<string | undefined>();
  const [loading, setLoading] = useState(!!levelParam || !!playgroundId);
  const [error, setError] = useState<string | null>(null);

  // Load saved playground by id, or challenge by ?level=
  useEffect(() => {
    if (playgroundId) {
      setLoading(true);
      setError(null);
      getPlayground(playgroundId)
        .then((playground) => {
          if (playground?.graph_json) {
            const { nodes, edges } = levelGraphToNeuralCanvas(playground.graph_json);
            setInitialGraph({ nodes, edges });
            setPlaygroundName(playground.name);
          } else {
            setInitialGraph(null);
            setError("Playground not found");
          }
        })
        .catch(() => {
          setInitialGraph(null);
          setError("Failed to load playground");
        })
        .finally(() => setLoading(false));
      return;
    }
    if (!levelParam) {
      setInitialGraph(null);
      setLoading(false);
      setError(null);
      setPlaygroundName(undefined);
      return;
    }
    const levelNum = Number(levelParam);
    if (!Number.isInteger(levelNum) || levelNum < 1) {
      setInitialGraph(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getLevelByNumber(levelNum)
      .then((level) => {
        if (level?.graph_json) {
          const { nodes, edges } = levelGraphToNeuralCanvas(level.graph_json);
          setInitialGraph({ nodes, edges });
        } else {
          setInitialGraph(null);
          setError("Level not found");
        }
      })
      .catch(() => {
        setInitialGraph(null);
        setError("Failed to load challenge");
      })
      .finally(() => setLoading(false));
  }, [levelParam, playgroundId]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-neural-bg">
        <div className="flex items-center gap-4 border-b border-neural-border shrink-0 z-30 bg-neural-bg">
          <Link
            href="/"
            className="shrink-0 px-3 py-2 text-sm text-neural-muted hover:text-neural-accent-light transition"
          >
            ← Home
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center text-neural-muted text-sm">
          {playgroundId ? "Loading playground…" : "Loading challenge…"}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-neural-bg">
        <div className="flex items-center gap-4 border-b border-neural-border shrink-0 z-30 bg-neural-bg">
          <Link
            href="/"
            className="shrink-0 px-3 py-2 text-sm text-neural-muted hover:text-neural-accent-light transition"
          >
            ← Home
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-neural-muted">
          <p className="text-sm">{error}</p>
          <Link
            href="/"
            className="text-sm text-amber-500 hover:text-amber-400 transition"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const initialNodes = initialGraph?.nodes ?? (playgroundId ? undefined : []);
  const initialEdges = initialGraph?.edges ?? (playgroundId ? undefined : []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-neural-bg">
      <div className="flex items-center gap-4 border-b border-neural-border shrink-0 z-30 bg-neural-bg">
        <Link
          href="/"
          className="shrink-0 px-3 py-2 text-sm text-neural-muted hover:text-neural-accent-light transition"
        >
          ← Home
        </Link>
      </div>
      <div className="flex-1 min-h-0 relative">
        <NeuralCanvas
          key={playgroundId ?? levelParam ?? "default"}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          playgroundId={playgroundId}
          playgroundName={playgroundName}
        />
      </div>
    </div>
  );
}
