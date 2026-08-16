import { createHash } from "node:crypto";

export type RubricContext = {
  id: string;
  levelRows: Array<{ id: string; label: string; points: number; order: number }>;
  criterionRows: Array<{ id: string; name: string; order: number }>;
};

export function rubricContentHash(rubric: RubricContext): string {
  const normalized = {
    id: rubric.id,
    levels: [...rubric.levelRows]
      .sort((a, b) => a.order - b.order)
      .map(({ id, label, points }) => ({ id, label, points })),
    criteria: [...rubric.criterionRows]
      .sort((a, b) => a.order - b.order)
      .map(({ id, name }) => ({ id, name })),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
