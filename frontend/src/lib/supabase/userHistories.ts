import { createClient } from "@/lib/supabase/client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Append a message to the chat history for a user + playground. */
export async function insertChatMessage(
  playgroundId: string,
  role: "user" | "assistant",
  content: string
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return false;

  const { error } = await supabase.from("user_histories").insert({
    user_id: user.id,
    playground_id: playgroundId,
    role,
    content,
  });
  return !error;
}

/** Load chat history for a user + playground, ordered by created_at. */
export async function getChatHistory(
  playgroundId: string
): Promise<ChatMessage[]> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return [];

  const { data, error } = await supabase
    .from("user_histories")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("playground_id", playgroundId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  return data as ChatMessage[];
}
