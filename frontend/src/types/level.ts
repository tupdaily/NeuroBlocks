import type { GraphSchema } from "./graph";

export interface LevelRow {
  id: string;
  level_number: number;
  name: string;
  description: string | null;
  /** Instruction shown in the playground for this challenge. */
  task: string | null;
  graph_json: GraphSchema;
  /** Correct answer graph for Submit check; null if level has no solution. */
  solution_graph_json: GraphSchema | null;
  /** Display section: 'challenges' (guided exercises) or 'papers' (paper-based design tasks). Omit for legacy rows. */
  section?: "challenges" | "papers";
  created_at: string;
  updated_at: string;
}
