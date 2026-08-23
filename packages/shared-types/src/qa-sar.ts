import { z } from "zod";
import { DSE_DOCUMENT_PREFIX } from "./document-content.ts";

const SarTextBlockBase = z.object({
  id: z.string().trim().min(1),
  text: z.string().max(20000),
});

export const QaSarBlockSchema = z.discriminatedUnion("type", [
  SarTextBlockBase.extend({ type: z.literal("paragraph") }),
  SarTextBlockBase.extend({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]) }),
  SarTextBlockBase.extend({ type: z.literal("bullet") }),
  z.object({
    id: z.string().trim().min(1),
    type: z.literal("richText"),
    content: z
      .string()
      .max(120000)
      .refine((value) => value.startsWith(DSE_DOCUMENT_PREFIX), {
        message: "SAR rich text must use the shared DSE document format",
      }),
  }),
  z.object({
    id: z.string().trim().min(1),
    type: z.literal("evidenceReference"),
    evidenceId: z.string().trim().min(1),
    label: z.string().trim().min(1).max(300),
  }),
  z.object({
    id: z.string().trim().min(1),
    type: z.literal("pmsData"),
    source: z.enum([
      "cloAttainment",
      "assessmentSummary",
      "stakeholderFeedback",
      "curriculumMapping",
      "custom",
    ]),
    label: z.string().trim().min(1).max(300),
  }),
]);

export const QaSarDocumentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(QaSarBlockSchema).max(500),
});

export const SaveQaSarSectionSchema = z.object({
  programmeId: z.string().trim().min(1),
  content: QaSarDocumentSchema,
  readiness: z.object({
    practiceDescribed: z.boolean(),
    resultsAnalysed: z.boolean(),
    improvementExplained: z.boolean(),
  }),
});

export const QaSarSectionQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export const QA_SAR_SECTION_STATUSES = [
  "notStarted",
  "drafting",
  "readyForReview",
  "underReview",
  "changesRequested",
  "approved",
] as const;
export const QaSarSectionStatusSchema = z.enum(QA_SAR_SECTION_STATUSES);

export type QaSarBlock = z.infer<typeof QaSarBlockSchema>;
export type QaSarDocument = z.infer<typeof QaSarDocumentSchema>;
export type SaveQaSarSectionInput = z.infer<typeof SaveQaSarSectionSchema>;
export type QaSarSectionStatus = z.infer<typeof QaSarSectionStatusSchema>;

export interface QaSarSectionView {
  id: string | null;
  programmeId: string;
  cycleId: string;
  criterionCode: string;
  criterionTitle: string;
  requirementCode: string;
  requirementTitle: string;
  content: QaSarDocument;
  plainText: string;
  status: QaSarSectionStatus;
  readiness: {
    practiceDescribed: boolean;
    resultsAnalysed: boolean;
    improvementExplained: boolean;
  };
  updatedByName: string | null;
  updatedAt: string | null;
}

export const EMPTY_QA_SAR_DOCUMENT: QaSarDocument = {
  version: 1,
  blocks: [{ id: "intro", type: "paragraph", text: "" }],
};
