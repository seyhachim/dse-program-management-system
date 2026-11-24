import { MARKING_SCHEME_HASH_PREFIX } from "./rubric-context.ts";

export type SchemeMapping = { criterionId: string; rubricId: string; rubricContentHash: string; cloCode: string };
export type SchemeScore = { criterionId: string; rubricId: string; rubricContentHash: string; score: number; maxScore: number };

export function hasMarkingSchemeMappings(mappings: readonly SchemeMapping[]): boolean {
  return mappings.some((mapping) => mapping.rubricContentHash.startsWith(MARKING_SCHEME_HASH_PREFIX));
}

/** One complete, version-bound exam contributes one earned/max aggregate per CLO.
 * Reject any incomplete/inconsistent exam, including wrong version and wrong total.
 * Preserve the exact individual score rows for evidence traceability. */
export function markingSchemeCloEvidence<T extends SchemeScore>(
  cloCode: string,
  mappings: readonly SchemeMapping[],
  rows: readonly T[],
  total: { score: number; maxScore: number },
): { percentage: number; rows: T[] } | null {
  if (!hasMarkingSchemeMappings(mappings) || mappings.length !== rows.length || !rows.length) return null;
  const keys = new Set(mappings.map((mapping) => mapping.criterionId));
  if (keys.size !== mappings.length || new Set(rows.map((row) => row.criterionId)).size !== rows.length) return null;
  if (new Set(mappings.map((mapping) => mapping.rubricId)).size !== 1 || new Set(mappings.map((mapping) => mapping.rubricContentHash)).size !== 1) return null;
  if (!mappings.every((mapping) => mapping.rubricContentHash.startsWith(MARKING_SCHEME_HASH_PREFIX) && rows.some((row) =>
    row.criterionId === mapping.criterionId && row.rubricId === mapping.rubricId && row.rubricContentHash === mapping.rubricContentHash &&
    Number.isFinite(row.score) && Number.isFinite(row.maxScore) && row.maxScore > 0 && row.score >= 0 && row.score <= row.maxScore
  ))) return null;
  const earned = rows.reduce((sum, row) => sum + row.score, 0);
  const maximum = rows.reduce((sum, row) => sum + row.maxScore, 0);
  if (!Number.isFinite(earned) || !Number.isFinite(maximum) || !Number.isFinite(total.score) || !Number.isFinite(total.maxScore) ||
      Math.abs(earned - total.score) > 1e-9 || Math.abs(maximum - total.maxScore) > 1e-9) return null;
  const relevant = new Set(mappings.filter((mapping) => mapping.cloCode === cloCode).map((mapping) => mapping.criterionId));
  const selected = rows.filter((row) => relevant.has(row.criterionId));
  if (!selected.length) return null;
  const score = selected.reduce((sum, row) => sum + row.score, 0);
  const max = selected.reduce((sum, row) => sum + row.maxScore, 0);
  return { percentage: Math.round(score / max * 10000) / 100, rows: selected };
}
