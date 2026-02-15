"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2, Plus, Layout, Trophy, FileText, ChevronRight, Check, LogOut } from "lucide-react";
import { listPlaygrounds, deletePlayground } from "@/lib/supabase/playgrounds";
import { listLevels } from "@/lib/supabase/levels";
import { getCompletedLevelNumbers } from "@/lib/supabase/levelCompletions";
import { getPaperProgress } from "@/lib/supabase/paperProgress";
import { PAPER_WALKTHROUGHS } from "@/lib/paperWalkthroughs";
import type { PlaygroundRow } from "@/types/playground";
import type { LevelRow } from "@/types/level";

type TabId = "playground" | "challenges" | "papers";

export function HomeDashboard({ user }: { user: User }) {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tab = searchParams.get("tab");
    if (tab === "challenges") return "challenges";
    if (tab === "papers") return "papers";
    return "playground";
  });
  const [playgrounds, setPlaygrounds] = useState<PlaygroundRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [completedLevels, setCompletedLevels] = useState<Set<number>>(new Set());
  const [paperProgress, setPaperProgress] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeletePlayground = async (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    const ok = await deletePlayground(id);
    setDeletingId(null);
    if (ok) setPlaygrounds((prev) => prev.filter((p) => p.id !== id));
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "challenges") setActiveTab("challenges");
    else if (tab === "papers") setActiveTab("papers");
  }, [searchParams]);

  useEffect(() => {
    listPlaygrounds().then((list) => {
      setPlaygrounds(list);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (activeTab !== "challenges" && activeTab !== "papers") return;
    setLevelsLoading(true);
    Promise.all([listLevels(), getCompletedLevelNumbers(), getPaperProgress()]).then(([list, completed, progress]) => {
      setLevels(list);
      setCompletedLevels(completed);
      setPaperProgress(progress);
      setLevelsLoading(false);
    });
  }, [activeTab]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const displayName =
    user.user_metadata?.full_name ??
    user.user_metadata?.user_name ??
    user.email?.split("@")[0] ??
    "User";

  const firstName = displayName.split(/\s+/)[0];

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return "Today";
    if (diff < 172800000) return "Yesterday";
    if (diff < 604800000) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "playground", label: "Playground", icon: <Layout className="h-4 w-4" /> },
    { id: "challenges", label: "Challenges", icon: <Trophy className="h-4 w-4" /> },
    { id: "papers", label: "Papers", icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 shadow-md shadow-violet-500/25">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.25" stroke="white" />
                <rect x="14" y="4" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.25" stroke="white" />
                <rect x="8.5" y="13" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.35" stroke="white" />
                <circle cx="6.5" cy="7.5" r="1" fill="white" />
                <circle cx="17.5" cy="7.5" r="1" fill="white" />
                <circle cx="12" cy="16.5" r="1" fill="white" />
                <path d="M10 10.5L14 10.5M12 11.5V14" opacity="0.7" stroke="white" strokeWidth="1.2" />
              </svg>
            </div>
            <span className="text-[16px] font-semibold text-[var(--foreground)] tracking-tight" style={{ fontFamily: "var(--font-outfit), var(--font-sans)" }}>NeuroBlocks</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--foreground-secondary)] hidden sm:inline">
              {displayName}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors rounded-lg px-2.5 py-1.5 hover:bg-[var(--surface-hover)]"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        {/* ── Hero / Welcome ──────────────────────────────────────────── */}
        <div className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto max-w-6xl px-6 pt-10 pb-7">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
              Welcome back, {firstName}
            </h1>
            <p className="mt-1.5 text-[var(--foreground-secondary)] text-[15px]">
              {activeTab === "playground"
                ? "Build and experiment with neural networks in your playgrounds."
                : activeTab === "challenges"
                  ? "Level up your skills with guided challenges."
                  : "Explore architecture designs from landmark papers."}
            </p>

            {/* ── Tab Navigation ──────────────────────────────────── */}
            <nav className="mt-7 flex gap-1 rounded-xl bg-[var(--surface-elevated)] p-1 w-fit" aria-label="Main sections">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--foreground-muted)] hover:text-[var(--foreground-secondary)]"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* ── Content Area ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-6 py-8">

            {/* ═══ PLAYGROUND TAB ════════════════════════════════════ */}
            {activeTab === "playground" && (
              <section className="animate-fade-in">
                <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {/* New playground card */}
                  <Link
                    href="/playground"
                    className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] min-h-[220px] p-6 transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]/30"
                  >
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)] text-[var(--accent)] transition-transform group-hover:scale-110 shadow-sm">
                      <Plus className="h-7 w-7" />
                    </span>
                    <span className="text-sm font-semibold text-[var(--foreground)]">New Playground</span>
                    <span className="mt-1 text-xs text-[var(--foreground-muted)]">Start from scratch</span>
                  </Link>

                  {loading ? (
                    [...Array(3)].map((_, i) => (
                      <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] min-h-[220px] p-6 animate-shimmer" />
                    ))
                  ) : (
                    playgrounds.map((pg) => (
                      <div key={pg.id} className="group relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] min-h-[220px] flex flex-col transition-all card-hover overflow-hidden">
                        <Link href={`/playground/${pg.id}`} className="absolute inset-0 flex flex-col rounded-2xl">
                          {/* Mini node preview */}
                          <div className="flex-1 min-h-[90px] bg-[var(--background-subtle)] flex items-center justify-center border-b border-[var(--border)]">
                            <div className="flex items-center gap-2 opacity-40">
                              <div className="h-5 w-7 rounded-md" style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.15)" }} />
                              <div className="h-[1px] w-5 bg-[var(--border-strong)]" />
                              <div className="h-5 w-7 rounded-md" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.15)" }} />
                              <div className="h-[1px] w-5 bg-[var(--border-strong)]" />
                              <div className="h-5 w-7 rounded-md" style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.15)" }} />
                            </div>
                          </div>
                          <div className="p-5">
                            <h3 className="font-semibold text-[var(--foreground)] truncate">{pg.name}</h3>
                            <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                              Updated {formatDate(pg.updated_at)}
                            </p>
                          </div>
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => handleDeletePlayground(e, pg.id, pg.name)}
                          disabled={deletingId === pg.id}
                          className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-[var(--surface)]/80 text-[var(--foreground-muted)] hover:text-red-500 hover:bg-[var(--danger-muted)] transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50 shadow-sm"
                          aria-label={`Delete ${pg.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {/* ═══ CHALLENGES TAB ═══════════════════════════════════ */}
            {activeTab === "challenges" && (
              <section className="animate-fade-in">
                <ChallengesSection
                  levels={levels}
                  completedLevels={completedLevels}
                  loading={levelsLoading}
                  section="challenges"
                  emptyTitle="No challenges yet"
                  emptyDesc="We're building guided exercises for you. Check back soon!"
                  ctaLabel="Start"
                  ctaDoneLabel="Play again"
                />
              </section>
            )}

            {/* ═══ PAPERS TAB ═══════════════════════════════════════ */}
            {activeTab === "papers" && (
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)]/50 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-base font-semibold text-[var(--foreground)]">
                        Papers
                      </h2>
                      <p className="text-sm text-[var(--foreground-muted)]">
                        Design architectures from classic papers.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {levelsLoading ? (
                    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                      {[...Array(2)].map((_, i) => (
                        <div
                          key={i}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] min-h-[140px] p-5 animate-pulse"
                        >
                          <div className="mb-3 h-10 w-10 rounded-xl bg-[var(--border-muted)]" />
                          <div className="mb-2 h-4 rounded bg-[var(--border-muted)] w-3/4" />
                          <div className="h-3 rounded bg-[var(--border-muted)] w-full" />
                        </div>
                      ))}
                    </div>
                  ) : (() => {
                    const paperLevels = levels.filter((l) => (l.section ?? "challenges") === "papers");
                    if (paperLevels.length === 0) {
                      return (
                        <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 py-16 text-center">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-elevated)] text-[var(--foreground-muted)]">
                            <FileText className="h-8 w-8" />
                          </div>
                          <p className="font-medium text-[var(--foreground)]">
                            No papers yet
                          </p>
                          <p className="max-w-sm text-sm text-[var(--foreground-muted)]">
                            Paper-based design tasks will appear here.
                          </p>
                        </div>
                      );
                    }
                    const categoryOrder = ["vision", "language", "other"] as const;
                    const categoryLabels: Record<string, string> = {
                      vision: "Vision",
                      language: "Language",
                      other: "Other",
                    };
                    const byCategory = new Map<string, typeof paperLevels>();
                    for (const level of paperLevels) {
                      const cat = level.paper_category ?? "other";
                      if (!byCategory.has(cat)) byCategory.set(cat, []);
                      byCategory.get(cat)!.push(level);
                    }
                    return (
                      <div className="space-y-8">
                        {categoryOrder.map((cat) => {
                          const list = byCategory.get(cat);
                          if (!list?.length) return null;
                          return (
                            <div key={cat}>
                              <h3 className="text-sm font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-4">
                                {categoryLabels[cat] ?? cat}
                              </h3>
                              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                                {list.map((level) => {
                                  const completed = completedLevels.has(level.level_number);
                                  const totalSteps = PAPER_WALKTHROUGHS[level.level_number]?.length ?? 0;
                                  const stepIndex = paperProgress[level.level_number] ?? -1;
                                  const percent = totalSteps > 0
                                    ? Math.min(100, Math.round(((stepIndex + 1) / totalSteps) * 100))
                                    : 0;
                                  return (
                                    <Link
                                      key={level.id}
                                      href={`/playground?level=${level.level_number}`}
                                      className="group rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] min-h-[140px] p-5 flex flex-col transition hover:border-amber-500/50 hover:bg-[var(--surface)] hover:shadow-[var(--glow)]"
                                    >
                                      <span className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] transition group-hover:bg-[var(--accent-muted)]/80">
                                        {completed ? (
                                          <Check className="h-5 w-5 text-emerald-500" />
                                        ) : (
                                          <FileText className="h-5 w-5" />
                                        )}
                                      </span>
                                      <span className="text-xs font-medium text-[var(--foreground-muted)]">
                                        Paper
                                        {percent > 0 && (
                                          <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">
                                            · {percent}%
                                          </span>
                                        )}
                                        {completed && (
                                          <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                            · Completed
                                          </span>
                                        )}
                                      </span>
                                      <h3 className="font-medium text-[var(--foreground)] mt-0.5 truncate">
                                        {level.name}
                                      </h3>
                                      {level.description && (
                                        <p className="mt-2 text-sm text-[var(--foreground-muted)] line-clamp-2">
                                          {level.description}
                                        </p>
                                      )}
                                      <span className="mt-auto pt-3 text-sm text-amber-600 dark:text-amber-400 font-medium opacity-0 group-hover:opacity-100 transition">
                                        {completed ? "Play again →" : "Design →"}
                                      </span>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {/* Uncategorized papers not in categoryOrder */}
                        {Array.from(byCategory.keys())
                          .filter((c) => !categoryOrder.includes(c as typeof categoryOrder[number]))
                          .map((cat) => (
                            <div key={cat}>
                              <h3 className="text-sm font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-4">
                                {categoryLabels[cat] ?? cat}
                              </h3>
                              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                                {byCategory.get(cat)!.map((level) => {
                                  const completed = completedLevels.has(level.level_number);
                                  const totalSteps = PAPER_WALKTHROUGHS[level.level_number]?.length ?? 0;
                                  const stepIndex = paperProgress[level.level_number] ?? -1;
                                  const percent = totalSteps > 0
                                    ? Math.min(100, Math.round(((stepIndex + 1) / totalSteps) * 100))
                                    : 0;
                                  return (
                                    <Link
                                      key={level.id}
                                      href={`/playground?level=${level.level_number}`}
                                      className="group rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] min-h-[140px] p-5 flex flex-col transition hover:border-amber-500/50 hover:bg-[var(--surface)] hover:shadow-[var(--glow)]"
                                    >
                                      <span className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] transition group-hover:bg-[var(--accent-muted)]/80">
                                        {completed ? <Check className="h-5 w-5 text-emerald-500" /> : <FileText className="h-5 w-5" />}
                                      </span>
                                      <span className="text-xs font-medium text-[var(--foreground-muted)]">
                                        Paper
                                        {percent > 0 && <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">· {percent}%</span>}
                                        {completed && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-medium">· Completed</span>}
                                      </span>
                                      <h3 className="font-medium text-[var(--foreground)] mt-0.5 truncate">{level.name}</h3>
                                      {level.description && <p className="mt-2 text-sm text-[var(--foreground-muted)] line-clamp-2">{level.description}</p>}
                                      <span className="mt-auto pt-3 text-sm text-amber-600 dark:text-amber-400 font-medium opacity-0 group-hover:opacity-100 transition">
                                        {completed ? "Play again →" : "Design →"}
                                      </span>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                      </div>
                    );
                  })()}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Challenges / Papers Grid ────────────────────────────────────────── */
function ChallengesSection({
  levels,
  completedLevels,
  loading,
  section,
  emptyTitle,
  emptyDesc,
  ctaLabel,
  ctaDoneLabel,
}: {
  levels: LevelRow[];
  completedLevels: Set<number>;
  loading: boolean;
  section: string;
  emptyTitle: string;
  emptyDesc: string;
  ctaLabel: string;
  ctaDoneLabel: string;
}) {
  const filteredLevels = levels.filter((l) => (l.section ?? "challenges") === section);

  if (loading) {
    return (
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] min-h-[200px] animate-shimmer" />
        ))}
      </div>
    );
  }

  if (filteredLevels.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--foreground-muted)]">
          {section === "papers" ? <FileText className="h-7 w-7" /> : <Trophy className="h-7 w-7" />}
        </div>
        <h3 className="font-semibold text-[var(--foreground)]">{emptyTitle}</h3>
        <p className="max-w-sm text-sm text-[var(--foreground-muted)]">{emptyDesc}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {filteredLevels.map((level) => {
        const completed = completedLevels.has(level.level_number);
        return (
          <Link
            key={level.id}
            href={`/playground?level=${level.level_number}`}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] min-h-[200px] p-6 flex flex-col transition-all card-hover"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                completed
                  ? "bg-[var(--success-muted)] text-emerald-500"
                  : "bg-[var(--warning-muted)] text-amber-500"
              }`}>
                {completed ? <Check className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}
              </span>
              {completed && (
                <span className="text-xs font-medium text-emerald-600 bg-[var(--success-muted)] rounded-full px-2.5 py-0.5">
                  Completed
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
              Level {level.level_number}
            </span>
            <h3 className="font-semibold text-[var(--foreground)] mt-1 truncate">{level.name}</h3>
            {level.description && (
              <p className="mt-2 text-sm text-[var(--foreground-muted)] line-clamp-2 flex-1">{level.description}</p>
            )}
            <span className="mt-4 text-sm font-medium text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {completed ? ctaDoneLabel : ctaLabel} <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
