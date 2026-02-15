import { createClient } from "@/lib/supabase/client";

/** Save current paper walkthrough step for the given level. Idempotent (upsert). */
export async function upsertPaperProgress(
  levelNumber: number,
  stepIndex: number
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return false;

  const { error } = await supabase.from("paper_progress").upsert(
    {
      user_id: user.id,
      level_number: levelNumber,
      step_index: Math.max(0, stepIndex),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,level_number" }
  );
  return !error;
}

/** Get step index per paper level for the current user. Returns Map<level_number, step_index>. */
export async function getPaperProgress(): Promise<Record<number, number>> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return {};

  const { data, error } = await supabase
    .from("paper_progress")
    .select("level_number, step_index")
    .eq("user_id", user.id);
  if (error) return {};

  const map: Record<number, number> = {};
  for (const row of data ?? []) {
    map[row.level_number] = row.step_index;
  }
  return map;
}
