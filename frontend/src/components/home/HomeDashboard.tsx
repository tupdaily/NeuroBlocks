"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { listPlaygrounds, deletePlayground } from "@/lib/supabase/playgrounds";
import { listLevels } from "@/lib/supabase/levels";
import { getCompletedLevelNumbers } from "@/lib/supabase/levelCompletions";
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
    Promise.all([listLevels(), getCompletedLevelNumbers()]).then(([list, completed]) => {
      setLevels(list);
      setCompletedLevels(completed);
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

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return "Today";
    if (diff < 172800000) return "Yesterday";
    if (diff < 604800000) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">
          AIPlayground
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--foreground-muted)]">
            {displayName}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-[var(--foreground-muted)] hover:text-[var(--accent)] transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface)]/50 to-[var(--background)]">
          <div className="mx-auto max-w-6xl px-6 pt-10 pb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
              Welcome back, {displayName.split(/\s+/)[0]}
            </h1>
            <p className="mt-1 text-[var(--foreground-muted)]">
              {activeTab === "playground"
                ? "Build and run visual workflows in your playgrounds."
                : activeTab === "challenges"
                  ? "Practice with guided challenges and level up your skills."
                  : "Papers and references."}
            </p>

            <nav
              className="mt-8 flex gap-0.5 rounded-xl bg-[var(--surface-elevated)] p-1 w-fit"
              aria-label="Main sections"
            >
              <button
                type="button"
                onClick={() => setActiveTab("playground")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  activeTab === "playground"
                    ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <PlaygroundIcon className="h-4 w-4" />
                Playground
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("challenges")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  activeTab === "challenges"
                    ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <ChallengesIcon className="h-4 w-4" />
                Challenges
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("papers")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  activeTab === "papers"
                    ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <PapersIcon className="h-4 w-4" />
                Papers
              </button>
            </nav>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-6 py-8">
            {activeTab === "playground" && (
              <section>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  <Link
                    href="/playground"
                    className="group flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] min-h-[160px] p-6 transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-elevated)] hover:shadow-[var(--glow)]"
                  >
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)] text-[var(--accent)] transition group-hover:bg-[var(--accent)]/20">
                      <PlusIcon className="h-7 w-7" />
                    </span>
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      New playground
                    </span>
                    <span className="mt-1 text-xs text-[var(--foreground-muted)]">
                      Start from scratch
                    </span>
                  </Link>

                  {loading ? (
                    [...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] min-h-[160px] p-5 animate-pulse"
                      >
                        <div className="mb-4 h-12 w-12 rounded-2xl bg-[var(--border-muted)]" />
                        <div className="mb-2 h-4 rounded bg-[var(--border-muted)] w-3/4" />
                        <div className="h-3 rounded bg-[var(--border-muted)] w-1/2" />
                      </div>
                    ))
                  ) : (
                    playgrounds.map((pg) => (
                      <div
                        key={pg.id}
                        className="group relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] min-h-[160px] p-5 flex flex-col transition hover:border-[var(--border)] hover:bg-[var(--surface-elevated)] hover:shadow-[var(--glow)]"
                      >
                        <Link
                          href={`/playground/${pg.id}`}
                          className="absolute inset-0 flex flex-col p-5 rounded-2xl"
                        >
                          <span className="mb-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] transition group-hover:bg-[var(--accent)]/20">
                            <PlaygroundIcon className="h-5 w-5" />
                          </span>
                          <h3 className="font-medium text-[var(--foreground)] truncate mb-0.5">
                            {pg.name}
                          </h3>
                          <p className="mt-auto text-xs text-[var(--foreground-muted)]">
                            Updated {formatDate(pg.updated_at)}
                          </p>
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => handleDeletePlayground(e, pg.id, pg.name)}
                          disabled={deletingId === pg.id}
                          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-[var(--foreground-muted)] hover:text-red-500 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
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

            {activeTab === "challenges" && (
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)]/50 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                      <ChallengesIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-base font-semibold text-[var(--foreground)]">
                        Challenges
                      </h2>
                      <p className="text-sm text-[var(--foreground-muted)]">
                        Guided exercises to practice and improve.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {levelsLoading ? (
                    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                      {[...Array(3)].map((_, i) => (
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
                    const challengeLevels = levels.filter((l) => (l.section ?? "challenges") === "challenges");
                    return challengeLevels.length === 0 ? (
                      <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 py-12 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-elevated)] text-[var(--foreground-muted)]">
                          <ChallengesIcon className="h-8 w-8" />
                        </div>
                        <p className="font-medium text-[var(--foreground)]">
                          No challenges yet
                        </p>
                        <p className="max-w-sm text-sm text-[var(--foreground-muted)]">
                          We&apos;re preparing challenges for you. Check back soon.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                        {challengeLevels.map((level) => {
                        const completed = completedLevels.has(level.level_number);
                        return (
                          <Link
                            key={level.id}
                            href={`/playground?level=${level.level_number}`}
                            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] min-h-[140px] p-5 flex flex-col transition hover:border-amber-500/50 hover:bg-[var(--surface)] hover:shadow-[var(--glow)]"
                          >
                            <span className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500 transition group-hover:bg-amber-500/25">
                              {completed ? (
                                <CheckIcon className="h-5 w-5 text-emerald-500" />
                              ) : (
                                <ChallengesIcon className="h-5 w-5" />
                              )}
                            </span>
                            <span className="text-xs font-medium text-[var(--foreground-muted)]">
                              Level {level.level_number}
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
                              {completed ? "Play again →" : "Start →"}
                            </span>
                          </Link>
                        );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </section>
            )}

            {activeTab === "papers" && (
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)]/50 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]">
                      <PapersIcon className="h-5 w-5" />
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
                    return paperLevels.length === 0 ? (
                      <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 py-16 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-elevated)] text-[var(--foreground-muted)]">
                          <PapersIcon className="h-8 w-8" />
                        </div>
                        <p className="font-medium text-[var(--foreground)]">
                          No papers yet
                        </p>
                        <p className="max-w-sm text-sm text-[var(--foreground-muted)]">
                          Paper-based design tasks will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                        {paperLevels.map((level) => {
                          const completed = completedLevels.has(level.level_number);
                          return (
                            <Link
                              key={level.id}
                              href={`/playground?level=${level.level_number}`}
                              className="group rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] min-h-[140px] p-5 flex flex-col transition hover:border-amber-500/50 hover:bg-[var(--surface)] hover:shadow-[var(--glow)]"
                            >
                              <span className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] transition group-hover:bg-[var(--accent-muted)]/80">
                                {completed ? (
                                  <CheckIcon className="h-5 w-5 text-emerald-500" />
                                ) : (
                                  <PapersIcon className="h-5 w-5" />
                                )}
                              </span>
                              <span className="text-xs font-medium text-[var(--foreground-muted)]">
                                Paper
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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-6 w-6"} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function PlaygroundIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
      />
    </svg>
  );
}

function ChallengesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function PapersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
