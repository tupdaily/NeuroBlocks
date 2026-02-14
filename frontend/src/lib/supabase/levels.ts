import { createClient } from "@/lib/supabase/client";
import type { LevelRow } from "@/types/level";

export async function listLevels(): Promise<LevelRow[]> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return [];

  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .order("level_number", { ascending: true });
  if (error) return [];
  return (data ?? []) as LevelRow[];
}

export async function getLevelByNumber(
  levelNumber: number
): Promise<LevelRow | null> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .eq("level_number", levelNumber)
    .maybeSingle();
  if (error || !data) return null;
  return data as LevelRow;
}
