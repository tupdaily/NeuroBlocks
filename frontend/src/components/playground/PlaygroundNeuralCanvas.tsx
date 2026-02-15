"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import { ChevronLeft, ChevronRight, Check, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { getLevelByNumber } from "@/lib/supabase/levels";
import { getPlayground, deletePlayground } from "@/lib/supabase/playgrounds";
import { getPaperProgress } from "@/lib/supabase/paperProgress";
import { recordLevelCompletion } from "@/lib/supabase/levelCompletions";
import { levelGraphToNeuralCanvas } from "@/lib/levelGraphAdapter";
import { PAPER_WALKTHROUGHS } from "@/lib/paperWalkthroughs";
import { getApiBase } from "@/neuralcanvas/lib/trainingApi";
import type { GraphSchema } from "@/types/graph";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const levelParam = searchParams.get("level");
  const [initialGraph, setInitialGraph] = useState<{
    nodes: Node[];
    edges: Edge[];
  } | null>(null);
  const [playgroundName, setPlaygroundName] = useState<string | undefined>();
  const [challengeTask, setChallengeTask] = useState<string | null>(null);
  const [challengeSolution, setChallengeSolution] = useState<GraphSchema | null>(null);
  const [isPaperLevel, setIsPaperLevel] = useState(false);
  const [walkthroughStepIndex, setWalkthroughStepIndex] = useState(0);
  const [walkthroughSteps, setWalkthroughSteps] = useState<typeof PAPER_WALKTHROUGHS[7] | null>(null);
  const [quizSelected, setQuizSelected] = useState<string | null>(null);
  const [quizCorrect, setQuizCorrect] = useState<boolean | null>(null);
  const [paperChatMessages, setPaperChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [paperChatLoading, setPaperChatLoading] = useState(false);
  const [paperChatInput, setPaperChatInput] = useState("");
  const [loading, setLoading] = useState(!!levelParam || !!playgroundId);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      setChallengeTask(null);
      setChallengeSolution(null);
      setIsPaperLevel(false);
      setWalkthroughSteps(null);
      setWalkthroughStepIndex(0);
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
    Promise.all([
      getLevelByNumber(levelNum),
      levelNum in PAPER_WALKTHROUGHS ? getPaperProgress() : Promise.resolve({} as Record<number, number>),
    ])
      .then(([level, progress]) => {
        if (level?.graph_json) {
          const isPaper = (level.section ?? "challenges") === "papers";
          const steps = levelNum in PAPER_WALKTHROUGHS ? PAPER_WALKTHROUGHS[levelNum as keyof typeof PAPER_WALKTHROUGHS] : null;
          setIsPaperLevel(isPaper);
          if (isPaper && steps?.length) {
            setWalkthroughSteps(steps);
            const saved = progress[levelNum] ?? 0;
            const stepIndex = Math.min(Math.max(0, saved), steps.length - 1);
            setWalkthroughStepIndex(stepIndex);
            const { nodes, edges } = levelGraphToNeuralCanvas(steps[stepIndex].graph, { forceSequentialLayout: true });
            setInitialGraph({ nodes, edges });
          } else {
            setWalkthroughSteps(null);
            setWalkthroughStepIndex(0);
            const { nodes, edges } = levelGraphToNeuralCanvas(level.graph_json);
            setInitialGraph({ nodes, edges });
          }
          const task =
            level.task?.trim() ||
            (levelNum === 1
              ? "Create a feed forward network using the flatten and linear layer"
              : null);
          setChallengeTask(task || null);
          setChallengeSolution(level.solution_graph_json ?? null);
        } else {
          setInitialGraph(null);
          setChallengeTask(null);
          setChallengeSolution(null);
          setIsPaperLevel(false);
          setWalkthroughSteps(null);
          setWalkthroughStepIndex(0);
          setError("Level not found");
        }
      })
      .catch(() => {
        setInitialGraph(null);
        setChallengeTask(null);
        setChallengeSolution(null);
        setIsPaperLevel(false);
        setWalkthroughSteps(null);
        setWalkthroughStepIndex(0);
        setError("Failed to load challenge");
      })
      .finally(() => setLoading(false));
  }, [levelParam, playgroundId]);

  const levelNum = levelParam ? parseInt(levelParam, 10) : 0;
  const challengeLevelNumber = levelNum >= 1 ? levelNum : null;
  const handleChallengeSuccess = useCallback(
    async (levelNumber: number) => {
      await recordLevelCompletion(levelNumber);
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.6 },
      });
      setTimeout(() => {
        router.push("/?tab=challenges");
      }, 1500);
    },
    [router]
  );

  const handleNext = useCallback(() => {
    setQuizSelected(null);
    setQuizCorrect(null);
    setWalkthroughStepIndex((i) => {
      const maxIdx = (walkthroughSteps?.length ?? 1) - 1;
      return Math.min(maxIdx, i + 1);
    });
  }, [walkthroughSteps?.length]);

  const handlePrev = useCallback(() => {
    setQuizSelected(null);
    setQuizCorrect(null);
    setWalkthroughStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleChoiceSelect = useCallback(
    (choice: string) => {
      if (quizCorrect !== null) return;
      const step = walkthroughSteps?.[walkthroughStepIndex];
      if (!step?.correctNext) return;
      setQuizSelected(choice);
      const correct = choice === step.correctNext;
      setQuizCorrect(correct);
    },
    [walkthroughStepIndex, walkthroughSteps, quizCorrect]
  );

  const handlePaperChatSend = useCallback(
    async (userMessage: string, step: NonNullable<typeof currentStep>) => {
      const trimmed = userMessage.trim();
      if (!trimmed) return;
      const newMessages: { role: "user" | "assistant"; content: string }[] = [
        ...paperChatMessages,
        { role: "user", content: trimmed },
      ];
      setPaperChatMessages(newMessages);
      setPaperChatInput("");
      setPaperChatLoading(true);
      try {
        const base = getApiBase();
        const body: {
          graph: GraphSchema;
          messages: { role: string; content: string }[];
          paper_context?: string;
          quiz_question?: string;
          quiz_choices?: string[];
          quiz_correct?: string;
        } = {
          graph: step.graph,
          messages: newMessages,
        };
        if (challengeTask?.trim()) body.paper_context = challengeTask.trim();
        if (step.nextQuestion) body.quiz_question = step.nextQuestion;
        if (step.nextChoices?.length) body.quiz_choices = step.nextChoices;
        if (step.correctNext) body.quiz_correct = step.correctNext;
        const res = await fetch(`${base}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        const assistantContent = !res.ok
          ? (data.detail ?? res.statusText ?? "Request failed")
          : data.feedback ?? "No response.";
        setPaperChatMessages((m) => [...m, { role: "assistant", content: assistantContent }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to get response.";
        setPaperChatMessages((m) => [...m, { role: "assistant", content: msg }]);
      } finally {
        setPaperChatLoading(false);
      }
    },
    [paperChatMessages, challengeTask]
  );

  const shuffledChoices = useMemo(() => {
    const choices = walkthroughSteps?.[walkthroughStepIndex]?.nextChoices ?? [];
    return [...choices].sort(() => Math.random() - 0.5);
  }, [walkthroughStepIndex, walkthroughSteps]);

  const handleDeletePlayground = useCallback(async () => {
    if (!playgroundId || deleting) return;
    const name = playgroundName ?? "this playground";
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const ok = await deletePlayground(playgroundId);
    setDeleting(false);
    if (ok) router.push("/");
  }, [playgroundId, playgroundName, deleting, router]);

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

  const inWalkthrough = isPaperLevel && walkthroughSteps && walkthroughSteps.length > 0;
  const currentStep = inWalkthrough ? walkthroughSteps[walkthroughStepIndex] : null;
  const stepCount = walkthroughSteps?.length ?? 0;
  const canPrev = walkthroughStepIndex > 0;
  const canNext = walkthroughStepIndex < stepCount - 1;

  const stepGraphNodesEdges = inWalkthrough && currentStep
    ? levelGraphToNeuralCanvas(currentStep.graph, { forceSequentialLayout: true })
    : null;
  const initialNodes = stepGraphNodesEdges?.nodes ?? initialGraph?.nodes ?? undefined;
  const initialEdges = stepGraphNodesEdges?.edges ?? initialGraph?.edges ?? undefined;

  const canvasKey = inWalkthrough
    ? `${playgroundId ?? levelParam ?? "default"}-walkthrough-step-${walkthroughStepIndex}`
    : playgroundId ?? levelParam ?? "default";

  const hasQuiz = currentStep?.nextQuestion && currentStep?.nextChoices?.length && currentStep?.correctNext;
  const showContinue = quizCorrect === true && hasQuiz;

  const showNameInput = playgroundId != null || isNewPlayground;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-neural-bg">
      <div className="flex items-center justify-between gap-4 border-b border-neural-border shrink-0 z-30 bg-neural-bg px-2">
        <Link
          href="/"
          className="shrink-0 px-3 py-2 text-sm text-neural-muted hover:text-neural-accent-light transition"
        >
          ← Home
        </Link>
        {showNameInput ? (
          <input
            type="text"
            value={playgroundName ?? ""}
            onChange={(e) => setPlaygroundName(e.target.value.trim() || undefined)}
            placeholder="Untitled"
            className="flex-1 max-w-md mx-4 px-3 py-2 text-sm bg-transparent border-none rounded-lg text-center text-[var(--foreground)] placeholder:text-neural-muted focus:outline-none focus:ring-2 focus:ring-neural-accent/50 focus:ring-inset"
            aria-label="Playground name"
          />
        ) : (
          <span className="flex-1 max-w-md mx-4 text-center text-sm text-neural-muted truncate" aria-hidden="true">
            {levelParam ? `Level ${levelParam}` : ""}
          </span>
        )}
        {playgroundId ? (
          <button
            type="button"
            onClick={handleDeletePlayground}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-neural-muted hover:text-red-400 transition disabled:opacity-50 shrink-0"
            title="Delete playground"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        ) : (
          <div className="w-14 shrink-0" aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <div
            key={canvasKey}
            className="h-full w-full animate-in fade-in duration-300"
            style={{ animationFillMode: "backwards" }}
          >
            <NeuralCanvas
            key={canvasKey}
            initialNodes={inWalkthrough ? initialNodes : initialNodes}
            initialEdges={inWalkthrough ? initialEdges : initialEdges}
            playgroundId={playgroundId}
            playgroundName={playgroundName}
            challengeTask={inWalkthrough ? null : challengeTask}
            challengeSolutionGraph={challengeSolution}
            challengeLevelNumber={challengeLevelNumber}
            onChallengeSuccess={handleChallengeSuccess}
            isPaperLevel={isPaperLevel}
            paperLevelNumber={inWalkthrough ? challengeLevelNumber : null}
            paperStepIndex={inWalkthrough ? walkthroughStepIndex : null}
          />
          </div>
        </div>
        {inWalkthrough && currentStep && (
          <div className="shrink-0 border-t border-neural-border bg-neural-surface/95 backdrop-blur-md px-5 py-4 z-20">
            {/* Progress bar */}
            <div className="max-w-6xl mx-auto mb-4">
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-amber-500/80 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${((walkthroughStepIndex + 1) / stepCount) * 100}%` }}
                />
              </div>
            </div>
            <div className="max-w-6xl mx-auto flex gap-6">
              {/* Left: step + multiple choice + actions */}
              <div className="min-w-0 flex-1 flex flex-col gap-4">
                <div
                  key={`step-${walkthroughStepIndex}`}
                  className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                  style={{ animationFillMode: "backwards" }}
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                      Step {walkthroughStepIndex + 1} of {stepCount}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {currentStep.title}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-400 leading-relaxed mb-1">
                    {currentStep.description}
                  </p>
                </div>

                {hasQuiz && (
                  <div
                    key={`quiz-${walkthroughStepIndex}`}
                    className="animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75"
                    style={{ animationFillMode: "backwards" }}
                  >
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                      {currentStep.nextQuestion}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {shuffledChoices.map((choice) => {
                        const selected = quizSelected === choice;
                        const isCorrectChoice = choice === currentStep.correctNext;
                        const showRight = quizCorrect !== null && isCorrectChoice;
                        const showWrong = quizCorrect === false && selected && !isCorrectChoice;
                        return (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => handleChoiceSelect(choice)}
                            disabled={quizCorrect !== null}
                            className={`
                              text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200
                              disabled:pointer-events-none
                              ${showRight ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300" : ""}
                              ${showWrong ? "border-red-500/60 bg-red-500/15 text-red-300 animate-shake" : ""}
                              ${!showRight && !showWrong && selected ? "border-amber-500/50 bg-amber-500/10" : ""}
                              ${!showRight && !showWrong && !selected ? "border-neural-border bg-white/5 hover:bg-white/10 hover:border-amber-500/30 text-neutral-300" : ""}
                            `}
                          >
                            <span className="flex items-center gap-2">
                              {showRight && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                              {showWrong && selected && <X className="h-4 w-4 shrink-0 text-red-400" />}
                              {choice}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {quizCorrect === false && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
                        <p className="text-xs text-red-400/90">
                          Not quite. The next layer is <strong>{currentStep.correctNext}</strong>.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setQuizSelected(null); setQuizCorrect(null); }}
                          className="text-xs font-medium text-amber-400 hover:text-amber-300 transition"
                        >
                          Try again
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 pt-1">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={!canPrev}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:pointer-events-none bg-white/5 border border-neural-border hover:bg-white/10 hover:border-amber-500/30 text-neutral-300"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  {showContinue ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 animate-in fade-in duration-200"
                    >
                      Continue
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={!canNext || (!!hasQuiz && quizCorrect !== true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:pointer-events-none bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Right: LLM discussion (paper + model + quiz context) */}
              <div className="w-80 h-[280px] shrink-0 flex flex-col rounded-xl border border-neural-border bg-neural-bg/80 overflow-hidden">
                <div className="shrink-0 px-3 py-2 border-b border-neural-border bg-neural-surface/50">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">Discuss</span>
                  <p className="text-xs text-neutral-400 mt-0.5">Ask about the paper, this step, or the architecture.</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
                  {paperChatMessages.length === 0 && (
                    <p className="text-[11px] text-neutral-500">Send a message to discuss the model, paper, or the multiple choice question.</p>
                  )}
                  {paperChatMessages.map((msg, i) =>
                    msg.role === "user" ? (
                      <div key={i} className="flex justify-end">
                        <div className="max-w-[90%] px-2.5 py-1.5 rounded-lg rounded-br-md bg-neural-accent/20 border border-neural-accent/30 text-[11px] text-neutral-200">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-[90%] px-2.5 py-1.5 rounded-lg rounded-bl-md bg-neural-bg/80 border border-neural-border/50 text-[11px] text-neutral-300 leading-relaxed [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-3 [&_code]:px-0.5 [&_code]:rounded [&_code]:bg-white/10">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc pl-3 space-y-0.5 my-1">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-3 space-y-0.5 my-1">{children}</ol>,
                              li: ({ children }) => <li>{children}</li>,
                              strong: ({ children }) => <strong className="font-semibold text-neutral-200">{children}</strong>,
                              code: ({ children }) => <code className="px-0.5 py-0.5 rounded bg-white/10 text-[10px] font-mono">{children}</code>,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )
                  )}
                  {paperChatLoading && (
                    <div className="flex justify-start">
                      <div className="px-2.5 py-1.5 rounded-lg rounded-bl-md bg-neural-border/30 text-[11px] text-neutral-400 flex items-center gap-1.5">
                        <span className="animate-pulse">Thinking...</span>
                      </div>
                    </div>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = paperChatInput.trim();
                    if (!text || paperChatLoading) return;
                    handlePaperChatSend(text, currentStep);
                  }}
                  className="shrink-0 p-2 border-t border-neural-border/60"
                >
                  <textarea
                    value={paperChatInput}
                    onChange={(e) => setPaperChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        const text = paperChatInput.trim();
                        if (text && !paperChatLoading) handlePaperChatSend(text, currentStep);
                      }
                    }}
                    placeholder="Ask about the paper or this step..."
                    rows={1}
                    disabled={paperChatLoading}
                    className="w-full px-2.5 py-2 rounded-lg bg-neural-bg border border-neural-border text-[11px] text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-none disabled:opacity-50"
                  />
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
