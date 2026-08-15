import { z } from "zod";
import { QaEvidenceKindSchema, QaEvidenceStatusSchema } from "./qa.ts";

const QaEvidenceMetadataSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(2000).default(""),
    kind: QaEvidenceKindSchema,
    sourceUrl: z.string().url().optional().or(z.literal("")),
    sourceRef: z.string().trim().max(300).optional().default(""),
    reportingPeriod: z.string().trim().max(100).optional().default(""),
    status: QaEvidenceStatusSchema.default("draft"),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "systemLink" && !value.sourceUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A URL is required for external or document evidence",
        path: ["sourceUrl"],
      });
    }
    if (value.kind === "systemLink" && !value.sourceRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A system reference is required for system-linked evidence",
        path: ["sourceRef"],
      });
    }
  });

export const CreateQaEvidenceItemSchema = QaEvidenceMetadataSchema;
export const UpdateQaEvidenceItemSchema = QaEvidenceMetadataSchema;

export const MapQaEvidenceSchema = z.object({
  programmeId: z.string().trim().min(1),
  requirementCode: z.string().regex(/^\d\.\d$/),
  expectationId: z.string().trim().min(1).nullable().optional(),
  relevanceNote: z.string().trim().max(2000).optional().default(""),
});

export const QaEvidenceLibraryQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export type CreateQaEvidenceItemInput = z.infer<typeof CreateQaEvidenceItemSchema>;
export type UpdateQaEvidenceItemInput = z.infer<typeof UpdateQaEvidenceItemSchema>;
export type MapQaEvidenceInput = z.infer<typeof MapQaEvidenceSchema>;

export interface QaEvidenceMappingView {
  id: string;
  cycleId: string;
  requirementCode: string;
  expectationId: string | null;
  relevanceNote: string;
  mappedByName: string | null;
  createdAt: string;
}

export interface QaEvidenceItemView {
  id: string;
  programmeId: string;
  title: string;
  description: string;
  kind: z.infer<typeof QaEvidenceKindSchema>;
  sourceUrl: string | null;
  sourceRef: string;
  reportingPeriod: string;
  status: z.infer<typeof QaEvidenceStatusSchema>;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  mappings: QaEvidenceMappingView[];
}
