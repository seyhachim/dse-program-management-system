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
  // Cover page taxonomy classification (issue #124) — free text, nullable
  // since existing PLOs predate this classification.
  major: z.string().nullable(),
  learningDomain: z.string().nullable(),
  specificOrGeneric: z.string().nullable(),
  cap: z.string().nullable(),
});

export type ProgramLearningOutcome = z.infer<
  typeof ProgramLearningOutcomeSchema
>;

/** Payload for `PUT /api/programme/plos/:code` — taxonomy fields only. */
export const UpdatePloTaxonomySchema = z.object({
  major: z.string().nullable(),
  learningDomain: z.string().nullable(),
  specificOrGeneric: z.string().nullable(),
  cap: z.string().nullable(),
});
export type UpdatePloTaxonomyInput = z.infer<typeof UpdatePloTaxonomySchema>;

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

/** Programme-level policy baseline inherited by course specifications. */
export const ProgramPolicySchema = z.object({
  attendancePreparation: z.string(),
  academicIntegrity: z.string(),
  assignmentsLateSubmission: z.string(),
  examinationRules: z.string(),
  penaltiesConsequences: z.string(),
});

export type ProgramPolicy = z.infer<typeof ProgramPolicySchema>;

export const ProgrammeProfileSchema = z.object({
  vision: z.string(),
  mission: z.array(z.string()),
  goals: z.array(z.string()),
  educationalPhilosophy: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      description: z.string(),
    }),
  ),
  peos: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      description: z.string(),
    }),
  ),
});

export type ProgrammeProfile = z.infer<typeof ProgrammeProfileSchema>;
export const UpdateProgrammeProfileSchema = ProgrammeProfileSchema;
export type UpdateProgrammeProfileInput = z.infer<
  typeof UpdateProgrammeProfileSchema
>;

export const UpdateProgramPolicySchema = ProgramPolicySchema;
export type UpdateProgramPolicyInput = z.infer<typeof UpdateProgramPolicySchema>;

/**
 * Programme academic configuration returned to consumers such as
 * Programme Management and Course Specification.
 */
export const ProgrammeAcademicConfigSchema = z.object({
  title: z.string(),
  profile: ProgrammeProfileSchema,
  plos: z.array(ProgramLearningOutcomeSchema),
  competencies: z.array(ProgramCompetencyWithPlosSchema),
  policy: ProgramPolicySchema,
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
