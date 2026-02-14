import { createClient } from "@/lib/supabase/client";

/** Record that the current user completed a challenge level. Idempotent (upsert). */
export async function recordLevelCompletion(levelNumber: number): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return;

  await supabase.from("level_completions").upsert(
    { user_id: user.id, level_number: levelNumber, completed_at: new Date().toISOString() },
    { onConflict: "user_id,level_number" }
  );
}

/** Get the set of level numbers the current user has completed. */
export async function getCompletedLevelNumbers(): Promise<Set<number>> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return new Set();

  const { data, error } = await supabase
    .from("level_completions")
    .select("level_number")
    .eq("user_id", user.id);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.level_number));
}
