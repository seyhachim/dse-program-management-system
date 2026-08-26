import { z } from "zod";

export const QA_SAR_BOOK_TEMPLATE_VERSION = "aun-qa-v4-sar-book-v1" as const;

export const QaSarBookPartKeySchema = z.enum(["part1", "part2", "part3", "part4"]);
export const QaSarBookSectionSourceSchema = z.enum([
  "bookNarrative",
  "requirementSar",
  "generated",
  "structured",
]);

export const QaSarBookSectionSchema = z.object({
  id: z.string().trim().min(1),
  key: z.string().trim().min(1),
  title: z.string().trim().min(1),
  order: z.number().int().positive(),
  required: z.boolean(),
  source: QaSarBookSectionSourceSchema,
  requirementId: z.string().trim().min(1).nullable(),
  requirementCode: z.string().trim().min(1).nullable(),
});

export const QaSarBookCriterionSchema = z.object({
  id: z.string().trim().min(1),
  code: z.string().trim().min(1),
  title: z.string().trim().min(1),
  order: z.number().int().positive(),
  sections: z.array(QaSarBookSectionSchema),
});

export const QaSarBookPartSchema = z.object({
  id: QaSarBookPartKeySchema,
  title: z.string().trim().min(1),
  order: z.number().int().min(1).max(4),
  sections: z.array(QaSarBookSectionSchema),
  criteria: z.array(QaSarBookCriterionSchema),
});

export const QaSarBookRequirementPinSchema = z.object({
  requirementCode: z.string().trim().min(1),
  submissionId: z.string().trim().min(1),
  submissionVersion: z.number().int().positive(),
});

export const QaSarBookReleaseLineageEntrySchema = z.object({
  releaseId: z.string().trim().min(1),
  releaseVersion: z.number().int().positive(),
  title: z.string().trim().min(1),
  templateVersion: z.string().trim().min(1),
  finalizedAt: z.string().datetime(),
  sourceSubmissionIds: z.array(z.string().trim().min(1)),
  requirementPins: z.array(QaSarBookRequirementPinSchema),
});

export const QaSarBookQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export const QaSarBookViewSchema = z.object({
  bookId: z.string().trim().min(1),
  templateVersion: z.literal(QA_SAR_BOOK_TEMPLATE_VERSION),
  programmeId: z.string().trim().min(1),
  cycleId: z.string().trim().min(1),
  cycleTitle: z.string().trim().min(1),
  framework: z.object({
    id: z.string().trim().min(1),
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
  }),
  parts: z.array(QaSarBookPartSchema).length(4),
  totals: z.object({
    parts: z.literal(4),
    criteria: z.number().int().nonnegative(),
    requirements: z.number().int().nonnegative(),
    staticSections: z.number().int().nonnegative(),
  }),
  lineage: z.array(QaSarBookReleaseLineageEntrySchema),
});

export type QaSarBookPartKey = z.infer<typeof QaSarBookPartKeySchema>;
export type QaSarBookSectionSource = z.infer<typeof QaSarBookSectionSourceSchema>;
export type QaSarBookSection = z.infer<typeof QaSarBookSectionSchema>;
export type QaSarBookCriterion = z.infer<typeof QaSarBookCriterionSchema>;
export type QaSarBookPart = z.infer<typeof QaSarBookPartSchema>;
export type QaSarBookRequirementPin = z.infer<typeof QaSarBookRequirementPinSchema>;
export type QaSarBookReleaseLineageEntry = z.infer<typeof QaSarBookReleaseLineageEntrySchema>;
export type QaSarBookView = z.infer<typeof QaSarBookViewSchema>;

export const QA_SAR_BOOK_STATIC_PARTS: ReadonlyArray<{
  id: Exclude<QaSarBookPartKey, "part2">;
  title: string;
  order: 1 | 3 | 4;
  sections: ReadonlyArray<{
    key: string;
    title: string;
    source: Exclude<QaSarBookSectionSource, "requirementSar">;
    required: boolean;
  }>;
}> = [
  {
    id: "part1",
    title: "Part 1 — Introduction",
    order: 1,
    sections: [
      {
        key: "part1.executive-summary",
        title: "Executive Summary",
        source: "bookNarrative",
        required: true,
      },
      {
        key: "part1.self-assessment-organisation",
        title: "Organisation of the Self-Assessment",
        source: "bookNarrative",
        required: true,
      },
      {
        key: "part1.programme-background",
        title: "University / Faculty / Department / Programme Background",
        source: "bookNarrative",
        required: true,
      },
    ],
  },
  {
    id: "part3",
    title: "Part 3 — Strengths and Weaknesses Analysis",
    order: 3,
    sections: [
      {
        key: "part3.strengths",
        title: "Summary of Strengths",
        source: "bookNarrative",
        required: true,
      },
      {
        key: "part3.weaknesses",
        title: "Summary of Weaknesses / Areas for Improvement",
        source: "bookNarrative",
        required: true,
      },
      {
        key: "part3.self-ratings",
        title: "Self-Ratings",
        source: "structured",
        required: true,
      },
      {
        key: "part3.improvement-plan",
        title: "Improvement Plan",
        source: "structured",
        required: true,
      },
    ],
  },
  {
    id: "part4",
    title: "Part 4 — Appendices",
    order: 4,
    sections: [
      {
        key: "part4.glossary",
        title: "Glossary",
        source: "bookNarrative",
        required: true,
      },
      {
        key: "part4.evidence-register",
        title: "Evidence Register",
        source: "generated",
        required: true,
      },
      {
        key: "part4.supporting-documents",
        title: "Supporting Documents",
        source: "structured",
        required: true,
      },
    ],
  },
] as const;
