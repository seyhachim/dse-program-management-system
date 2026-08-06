import { z } from "zod";

/**
 * Programme-level constants — the "fixed" tier of the course specification
 * (syllabus Part 1 + §1 Programme Title). This system serves a single
 * programme, so these are configuration, not per-course data.
 */
export const PROGRAMME_TITLE =
  "Bachelor of Engineering in Data Science and Engineering";

/**
 * A programme-level learning outcome.
 *
 * `code` is the stable academic identifier (for example PLO1).
 * Existing CourseSpecClo.mappedPlos values continue storing these codes,
 * so the database id must not replace the code in existing course specs.
 */
export const ProgramLearningOutcomeSchema = z.object({
  id: z.string(),
  code: z.string(),
  description: z.string(),
  order: z.number().int(),
  active: z.boolean(),
});

export type ProgramLearningOutcome = z.infer<
  typeof ProgramLearningOutcomeSchema
>;

/**
 * A programme-level graduate competency.
 */
export const ProgramCompetencySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  active: z.boolean(),
});

export type ProgramCompetency = z.infer<typeof ProgramCompetencySchema>;

/**
 * Lightweight PLO representation embedded inside a competency response.
 *
 * This avoids exposing the database join-table shape directly to the
 * frontend. The frontend works with academic domain objects instead.
 */
export const ProgramCompetencyPloSchema = z.object({
  id: z.string(),
  code: z.string(),
  description: z.string(),
  order: z.number().int(),
});

export type ProgramCompetencyPlo = z.infer<typeof ProgramCompetencyPloSchema>;

/**
 * Competency including its currently mapped Programme Learning Outcomes.
 */
export const ProgramCompetencyWithPlosSchema = ProgramCompetencySchema.extend({
  plos: z.array(ProgramCompetencyPloSchema),
});

export type ProgramCompetencyWithPlos = z.infer<
  typeof ProgramCompetencyWithPlosSchema
>;

/**
 * Programme academic configuration returned to consumers such as
 * Programme Management and Course Specification.
 */
export const ProgrammeAcademicConfigSchema = z.object({
  title: z.string(),
  plos: z.array(ProgramLearningOutcomeSchema),
  competencies: z.array(ProgramCompetencyWithPlosSchema),
});

export type ProgrammeAcademicConfig = z.infer<
  typeof ProgrammeAcademicConfigSchema
>;

/**
 * Payload for creating a programme competency.
 *
 * PLO mappings are intentionally separate because competency catalogue
 * maintenance and academic alignment are separate operations.
 */
export const CreateProgramCompetencySchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  order: z.number().int().positive(),
});

export type CreateProgramCompetencyInput = z.infer<
  typeof CreateProgramCompetencySchema
>;

/**
 * Payload for editing a programme competency.
 */
export const UpdateProgramCompetencySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  order: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

export type UpdateProgramCompetencyInput = z.infer<
  typeof UpdateProgramCompetencySchema
>;

/**
 * Replaces the PLO mappings for one competency.
 *
 * PLO codes are used at the API boundary rather than Prisma ids because
 * PLO1, PLO2, ... are the stable academic identifiers already used by
 * Course Specification.
 */
export const UpdateProgramCompetencyPlosSchema = z.object({
  ploCodes: z.array(z.string()).default([]),
});

export type UpdateProgramCompetencyPlosInput = z.infer<
  typeof UpdateProgramCompetencyPlosSchema
>;
