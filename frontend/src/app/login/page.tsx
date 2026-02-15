"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GripVertical, Zap, Eye } from "lucide-react";

/* ── Soft pastel gradient background with floating shapes ────────────── */
function LightBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Subtle dot grid */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dotgrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="1" fill="#6366F1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotgrid)" />
      </svg>

      {/* Pastel gradient blobs */}
      <div
        className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, #C7D2FE 0%, transparent 70%)" }}
      />
      <div
        className="absolute top-1/3 -right-32 h-[400px] w-[400px] rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, #BBF7D0 0%, transparent 70%)" }}
      />
      <div
        className="absolute -bottom-32 left-1/3 h-[350px] w-[350px] rounded-full opacity-20 blur-[100px]"
        style={{ background: "radial-gradient(circle, #FECDD3 0%, transparent 70%)" }}
      />
    </div>
  );
}

/* ── CSS-only neural network illustration ─────────────────────────────── */
function NeuralIllustration() {
  const layers = [
    { count: 3, color: "#F59E0B" },
    { count: 4, color: "#6366F1" },
    { count: 4, color: "#8B5CF6" },
    { count: 2, color: "#10B981" },
  ];

  const layerSpacing = 56;
  const nodeRadius = 6;
  const startX = 30;
  const totalWidth = startX * 2 + (layers.length - 1) * layerSpacing;
  const maxNodes = Math.max(...layers.map((l) => l.count));
  const totalHeight = maxNodes * 28 + 20;

  const getY = (nodeIndex: number, total: number) => {
    const spacing = 28;
    const layerHeight = (total - 1) * spacing;
    return (totalHeight - layerHeight) / 2 + nodeIndex * spacing;
  };

  return (
    <div className="flex justify-center mb-6">
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="opacity-60"
      >
        {/* Connections */}
        {layers.map((layer, li) => {
          if (li === 0) return null;
          const prev = layers[li - 1];
          return Array.from({ length: prev.count }).flatMap((_, pi) =>
            Array.from({ length: layer.count }).map((_, ni) => (
              <line
                key={`${li}-${pi}-${ni}`}
                x1={startX + (li - 1) * layerSpacing}
                y1={getY(pi, prev.count)}
                x2={startX + li * layerSpacing}
                y2={getY(ni, layer.count)}
                stroke="#D1D5DB"
                strokeWidth="1"
                opacity="0.6"
              />
            ))
          );
        })}
        {/* Nodes */}
        {layers.map((layer, li) =>
          Array.from({ length: layer.count }).map((_, ni) => (
            <circle
              key={`node-${li}-${ni}`}
              cx={startX + li * layerSpacing}
              cy={getY(ni, layer.count)}
              r={nodeRadius}
              fill={layer.color}
              opacity="0.85"
            />
          ))
        )}
      </svg>
    </div>
  );
}

/* ── Logo ──────────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 shadow-lg shadow-violet-500/30">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.2" stroke="white" />
          <rect x="14" y="4" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.2" stroke="white" />
          <rect x="8.5" y="13" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.3" stroke="white" />
          <circle cx="6.5" cy="7.5" r="1" fill="white" />
          <circle cx="17.5" cy="7.5" r="1" fill="white" />
          <circle cx="12" cy="16.5" r="1" fill="white" />
          <path d="M10 10.5L14 10.5M12 11.5V14" opacity="0.8" stroke="white" strokeWidth="1.2" />
        </svg>
      </div>
      <h1
        className="text-4xl font-semibold tracking-tight text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-outfit), var(--font-sans)" }}
      >
        NeuroBlocks
      </h1>
    </div>
  );
}

/* ── Feature Pills ────────────────────────────────────────────────────── */
function FeaturePills() {
  const features = [
    { icon: GripVertical, label: "Drag & Drop", color: "#F59E0B" },
    { icon: Zap, label: "Train in Real-time", color: "#6366F1" },
    { icon: Eye, label: "Peek Inside Models", color: "#10B981" },
  ];

  return (
    <div className="flex flex-wrap gap-2.5 justify-center mt-8">
      {features.map((f) => {
        const Icon = f.icon;
        return (
          <span
            key={f.label}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-2 text-xs font-medium text-[var(--foreground-secondary)] shadow-sm border border-[var(--border)]"
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: f.color }} strokeWidth={2.25} />
            {f.label}
          </span>
        );
      })}
    </div>
  );
}

/* ── Main Login Page ──────────────────────────────────────────────────── */
export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/");
    });
    return () => subscription.unsubscribe();
  }, [supabase.auth, router]);

  const handleOAuth = async (provider: "google" | "github") => {
    setError(null);
    setLoading(provider);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError(err.message);
      setLoading(null);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-b from-[var(--background)] to-[var(--background-subtle)]">
      <LightBg />

      <div className="relative z-10 w-full max-w-[420px] animate-fade-in">
        {/* Brand */}
        <div className="flex justify-center mb-6">
          <Logo />
        </div>

        {/* Neural illustration */}
        <NeuralIllustration />

        <p className="text-center text-[var(--foreground-muted)] text-[13px] mb-8">
          No setup. No code. Just drag, connect, and learn.
        </p>

        {/* Auth Card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-sm p-8 shadow-lg">
          <h2 className="text-center text-lg font-semibold text-[var(--foreground)] mb-1">
            Get Started
          </h2>
          <p className="text-center text-xs text-[var(--foreground-muted)] mb-6">
            Sign in to save your playgrounds and track progress
          </p>

          {error && (
            <div
              className="mb-5 rounded-xl bg-[var(--danger-muted)] border border-[var(--danger)]/30 px-4 py-3 text-sm text-[var(--danger)]"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={!!loading}
              aria-busy={loading === "google"}
              className="flex items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-[var(--foreground)] font-medium transition-all hover:border-[var(--border-strong)] hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === "google" ? <Spinner /> : <GoogleIcon className="h-5 w-5" />}
              <span className="text-sm">Continue with Google</span>
            </button>

            <button
              type="button"
              onClick={() => handleOAuth("github")}
              disabled={!!loading}
              aria-busy={loading === "github"}
              className="flex items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-[var(--foreground)] font-medium transition-all hover:border-[var(--border-strong)] hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === "github" ? <Spinner /> : <GitHubIcon className="h-5 w-5" />}
              <span className="text-sm">Continue with GitHub</span>
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-[var(--foreground-muted)] leading-relaxed">
            No password needed. Sign in securely with your existing account.
          </p>
        </div>

        {/* Feature pills */}
        <FeaturePills />

        {/* Footer */}
        <p className="text-center text-[11px] text-[var(--foreground-muted)] mt-8 opacity-60">
          Made with care for curious minds
        </p>
      </div>
    </div>
  );
}

/* ── Spinner ──────────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.15" />
      <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────── */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
    </svg>
  );
}
