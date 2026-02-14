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
  created_at: string;
  updated_at: string;
}
