import { z } from "zod";

/** A method vocabulary entry as returned to the client. */
export const MethodSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Optional at the shared-contract boundary so older fixtures/consumers that
  // predate managed vocabulary remain source-compatible. The live methods API
  // always returns a boolean; consumers should treat only `false` as archived.
  active: z.boolean().optional(),
});
export type Method = z.infer<typeof MethodSchema>;

/** Which method vocabulary (used by the §14 CLO form) a method belongs to. */
export type MethodKind = "teaching" | "assessment";

/** Body for adding a method: trimmed, non-empty. */
export const CreateMethodInput = z.object({
  name: z.string().trim().min(1, "Method name is required"),
});
export type CreateMethodInput = z.infer<typeof CreateMethodInput>;

/** Body for renaming an existing method. */
export const UpdateMethodInput = CreateMethodInput;
export type UpdateMethodInput = z.infer<typeof UpdateMethodInput>;

/** Soft-delete / restore input used by managed programme vocabularies. */
export const SetVocabularyActiveInput = z.object({ active: z.boolean() });
export type SetVocabularyActiveInput = z.infer<typeof SetVocabularyActiveInput>;

export const ActiveLearningStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  clusterId: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});
export type ActiveLearningStrategy = z.infer<typeof ActiveLearningStrategySchema>;

export const ActiveLearningClusterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  strategies: z.array(ActiveLearningStrategySchema),
});
export type ActiveLearningCluster = z.infer<typeof ActiveLearningClusterSchema>;

export const CreateActiveLearningClusterInput = z.object({
  id: z.string().trim().min(1).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens"),
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateActiveLearningClusterInput = z.infer<typeof CreateActiveLearningClusterInput>;

export const UpdateActiveLearningClusterInput = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
  sortOrder: z.number().int().nonnegative(),
});
export type UpdateActiveLearningClusterInput = z.infer<typeof UpdateActiveLearningClusterInput>;

export const CreateActiveLearningStrategyInput = z.object({
  id: z.string().trim().min(1).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens"),
  name: z.string().trim().min(1),
  clusterId: z.string().trim().min(1),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateActiveLearningStrategyInput = z.infer<typeof CreateActiveLearningStrategyInput>;

export const UpdateActiveLearningStrategyInput = z.object({
  name: z.string().trim().min(1),
  clusterId: z.string().trim().min(1),
  sortOrder: z.number().int().nonnegative(),
});
export type UpdateActiveLearningStrategyInput = z.infer<typeof UpdateActiveLearningStrategyInput>;

/** GET /api/methods response — active vocabularies for lecturer-facing selectors. */
export const MethodsResponse = z.object({
  teaching: z.array(MethodSchema),
  assessment: z.array(MethodSchema),
  activeLearningClusters: z.array(ActiveLearningClusterSchema),
});
export type MethodsResponse = z.infer<typeof MethodsResponse>;

/** Admin/programme-management response including archived entries. */
export const ManagedMethodsResponse = MethodsResponse;
export type ManagedMethodsResponse = z.infer<typeof ManagedMethodsResponse>;
