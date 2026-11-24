import { createHash } from "node:crypto";

export type RubricContext = {
  id: string;
  instrumentKind?: string;
  levelRows: Array<{ id: string; label: string; points: number; order: number }>;
  criterionRows: Array<{ id: string; name: string; order: number; maxPoints?: number | null }>;
};

export const MARKING_SCHEME_HASH_PREFIX = "marking-scheme-v1:";

export function rubricContentHash(rubric: RubricContext): string {
  if (rubric.instrumentKind === "marking_scheme") {
    const questions = [...rubric.criterionRows].sort((a, b) => a.order - b.order).map(({ id, name, maxPoints }) => ({ id, name, maxPoints }));
    return MARKING_SCHEME_HASH_PREFIX + createHash("sha256").update(JSON.stringify({ id: rubric.id, questions })).digest("hex");
  }
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
