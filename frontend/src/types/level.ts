import type { GraphSchema } from "./graph";

export interface LevelRow {
  id: string;
  level_number: number;
  name: string;
  description: string | null;
  graph_json: GraphSchema;
  created_at: string;
  updated_at: string;
}
