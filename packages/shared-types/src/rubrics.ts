import { z } from "zod";
import { ASSESSMENT_TYPES } from "./course-spec.ts";

/**
 * Rubric Library domain schemas. A rubric is a reusable assessment grid: a set
 * of ordered rating **levels** (the columns, e.g. 4-Excellent … 1-Poor) and a
 * set of **criteria** (the rows, e.g. "Content Quality"), where each criterion
 * carries one descriptor per level. Defined once here and imported by both the
 * backend (request validation + Prisma boundary) and the frontend (form + view),
 * so the wire contract stays identical on both ends.
 */

/** A rubric's status. `Active` counts as published/usable; `Archived` is hidden. */
export const RUBRIC_STATUSES = ["Active", "Draft", "Archived"] as const;
export const RubricStatusSchema = z.enum(RUBRIC_STATUSES);
export type RubricStatus = z.infer<typeof RubricStatusSchema>;

/**
 * Rubric type vocabulary — reuses the §17 assessment types so a rubric's type
 * lines up with the assessment kind it will eventually be linked to.
 */
export const RUBRIC_TYPES = ASSESSMENT_TYPES;
export const RubricTypeSchema = z.enum(RUBRIC_TYPES);
export type RubricType = z.infer<typeof RubricTypeSchema>;

/**
 * One column of the grid: a rating level with a display label and a numeric
 * score. Levels are stored highest-first (Excellent → Poor), matching the way
 * the grid renders left-to-right.
 */
export const RubricLevel = z.object({
  label: z.string().trim().min(1, "A level label is required"),
  points: z.coerce.number().min(0, "Points must be ≥ 0"),
});
export type RubricLevel = z.infer<typeof RubricLevel>;

/**
 * One row of the grid: a criterion with a name and one descriptor per level.
 * `descriptors` aligns to `Rubric.levels` by index; a criterion is scored out of
 * the top level's points, so the whole rubric shares a single rating scale.
 */
export const RubricCriterion = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "A criterion name is required"),
  descriptors: z.array(z.string()).default([]),
});
export type RubricCriterion = z.infer<typeof RubricCriterion>;

/** The default 4-point rating scale new rubrics start from. */
export const DEFAULT_RUBRIC_LEVELS: readonly RubricLevel[] = [
  { label: "Excellent", points: 4 },
  { label: "Good", points: 3 },
  { label: "Fair", points: 2 },
  { label: "Poor", points: 1 },
] as const;

/** The rubric owner as embedded in authenticated API responses. */
export const RubricOwner = z.object({
  id: z.string(),
  name: z.string(),
});
export type RubricOwner = z.infer<typeof RubricOwner>;

/** Full rubric as returned by authenticated management/read APIs. */
export const RubricSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: RubricTypeSchema,
  description: z.string(),
  levels: z.array(RubricLevel).min(1),
  criteria: z.array(RubricCriterion),
  status: RubricStatusSchema,
  owner: RubricOwner.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Rubric = z.infer<typeof RubricSchema>;

/**
 * Deliberately small public contract. Only published (`Active`) rubric content
 * is exposed; ownership and internal lifecycle timestamps never leave the public
 * endpoint.
 */
export const PublicRubricSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: RubricTypeSchema,
  description: z.string(),
  levels: z.array(RubricLevel).min(1),
  criteria: z.array(RubricCriterion),
  status: z.literal("Active"),
});
export type PublicRubric = z.infer<typeof PublicRubricSchema>;

/** Body for POST /api/rubrics. Owner is taken from the caller, never the body. */
export const CreateRubricInput = z.object({
  name: z.string().trim().min(1, "A rubric name is required"),
  type: RubricTypeSchema,
  description: z.string().trim().default(""),
  levels: z.array(RubricLevel).min(1, "At least one rating level is required"),
  criteria: z.array(RubricCriterion).min(1, "At least one criterion is required"),
  status: RubricStatusSchema.default("Draft"),
});
export type CreateRubricInput = z.infer<typeof CreateRubricInput>;

/** Body for PATCH /api/rubrics/:id — all fields optional. */
export const UpdateRubricInput = CreateRubricInput.partial();
export type UpdateRubricInput = z.infer<typeof UpdateRubricInput>;

/** Query params for GET /api/rubrics. */
export const ListRubricsQuery = z.object({
  search: z.string().trim().optional(),
  status: RubricStatusSchema.optional(),
});
export type ListRubricsQuery = z.infer<typeof ListRubricsQuery>;

/** The highest points value across a rubric's levels — a criterion's max score. */
export function rubricMaxLevelPoints(levels: readonly RubricLevel[]): number {
  return levels.reduce((max, l) => Math.max(max, l.points), 0);
}

/** Total points a rubric can award: each criterion scored out of the top level. */
export function rubricTotalPoints(rubric: {
  levels: readonly RubricLevel[];
  criteria: readonly RubricCriterion[];
}): number {
  return rubric.criteria.length * rubricMaxLevelPoints(rubric.levels);
}

/** One-line rating-scale summary, e.g. "4 – Excellent, 3 – Good, 2 – Fair, 1 – Poor". */
export function rubricScaleSummary(levels: readonly RubricLevel[]): string {
  return levels.map((l) => `${l.points} – ${l.label}`).join(", ");
}
