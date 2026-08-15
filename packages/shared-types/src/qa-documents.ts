import { z } from "zod";

export const QaDocumentTypeSchema = z.enum([
  "policy",
  "minutes",
  "survey",
  "report",
  "specification",
  "staffDocument",
  "other",
]);

export const QaDocumentBlockSchema = z.object({
  text: z.string().min(1).max(100_000),
  pageNumber: z.number().int().positive().nullable().optional().default(null),
  sectionLabel: z.string().trim().max(300).optional().default(""),
});

const QaDocumentContentSchema = z
  .array(QaDocumentBlockSchema)
  .min(1)
  .max(1000)
  .superRefine((blocks, ctx) => {
    const total = blocks.reduce((sum, block) => sum + block.text.length, 0);
    if (total > 5_000_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "QA document content cannot exceed 5,000,000 characters",
      });
    }
  });

export const CreateQaDocumentSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    title: z.string().trim().min(3).max(300),
    documentType: QaDocumentTypeSchema,
    sourceUrl: z.string().url().nullable().optional().default(null),
    sourceRef: z.string().trim().max(500).optional().default(""),
    version: z.string().trim().min(1).max(100).default("1"),
    reportingStart: z.coerce.date().nullable().optional().default(null),
    reportingEnd: z.coerce.date().nullable().optional().default(null),
    blocks: QaDocumentContentSchema,
  })
  .superRefine((value, ctx) => {
    if (value.reportingStart && value.reportingEnd && value.reportingEnd < value.reportingStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reporting end must be on or after reporting start",
        path: ["reportingEnd"],
      });
    }
  });

export const ReplaceQaDocumentSchema = CreateQaDocumentSchema;

export const QaDocumentListQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  documentType: QaDocumentTypeSchema.optional(),
});

export const QaDocumentScopeSchema = z.object({
  programmeId: z.string().trim().min(1),
});

export const QaSemanticEvidenceQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  expectedEvidenceId: z.string().trim().min(1).max(200),
  topK: z.coerce.number().int().min(1).max(50).default(10),
});

export type CreateQaDocumentInput = z.infer<typeof CreateQaDocumentSchema>;
export type ReplaceQaDocumentInput = z.infer<typeof ReplaceQaDocumentSchema>;
export type QaDocumentType = z.infer<typeof QaDocumentTypeSchema>;

export interface QaDocumentChunkView {
  id: string;
  documentId: string;
  chunkIndex: number;
  pageNumber: number | null;
  sectionLabel: string;
  startOffset: number;
  endOffset: number;
  text: string;
  embedded: boolean;
  embeddingModel: string;
}

export interface QaDocumentView {
  id: string;
  programmeId: string;
  title: string;
  documentType: QaDocumentType;
  sourceUrl: string | null;
  sourceRef: string;
  version: string;
  reportingStart: string | null;
  reportingEnd: string | null;
  contentHash: string;
  chunkCount: number;
  embeddedChunkCount: number;
  embeddingModel: string | null;
  createdAt: string;
  updatedAt: string;
}
