import { z } from "zod";

export const ProgrammePublicPublicationStatusSchema = z.enum([
  "Draft",
  "Published",
]);
export type ProgrammePublicPublicationStatus = z.infer<
  typeof ProgrammePublicPublicationStatusSchema
>;

export const ProgrammeFaqCategorySchema = z.enum([
  "About",
  "Admission",
  "Curriculum",
  "Careers",
  "FeesScholarships",
  "StudentLife",
  "Facilities",
  "Lecturers",
  "ImportantDates",
  "Contact",
]);
export type ProgrammeFaqCategory = z.infer<typeof ProgrammeFaqCategorySchema>;

export const ProgrammeImportantDateKindSchema = z.enum([
  "ApplicationOpen",
  "ApplicationDeadline",
  "EntranceExam",
  "Interview",
  "ResultsAnnouncement",
  "Registration",
  "SemesterStart",
  "ScholarshipDeadline",
  "Other",
]);
export type ProgrammeImportantDateKind = z.infer<
  typeof ProgrammeImportantDateKindSchema
>;

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case slug");

const optionalTrimmedUrl = z
  .string()
  .trim()
  .url()
  .nullable()
  .optional();

const publicationFields = {
  status: ProgrammePublicPublicationStatusSchema.default("Draft"),
  publishedAt: z.coerce.date().nullable().optional(),
};

function validatePublicationState(
  value: { status: ProgrammePublicPublicationStatus; publishedAt?: Date | null },
  ctx: z.RefinementCtx,
) {
  if (value.status === "Published" && !value.publishedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publishedAt"],
      message: "publishedAt is required when status is Published",
    });
  }
  if (value.status === "Draft" && value.publishedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publishedAt"],
      message: "publishedAt must be empty while status is Draft",
    });
  }
}

export const ProgrammeFaqInputSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    category: ProgrammeFaqCategorySchema,
    slug: slugSchema,
    question: z.string().trim().min(1).max(500),
    answer: z.string().trim().min(1),
    shortAnswer: z.string().trim().max(1000).nullable().optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).default([]),
    sortOrder: z.number().int().min(0).default(0),
    isFeatured: z.boolean().default(false),
    sourceLabel: z.string().trim().max(200).nullable().optional(),
    sourceUrl: optionalTrimmedUrl,
    reviewedAt: z.coerce.date().nullable().optional(),
    ...publicationFields,
  })
  .superRefine(validatePublicationState);
export type ProgrammeFaqInput = z.infer<typeof ProgrammeFaqInputSchema>;

export const ProgrammeImportantDateInputSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    kind: ProgrammeImportantDateKindSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(""),
    date: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    sortOrder: z.number().int().min(0).default(0),
    ...publicationFields,
  })
  .superRefine((value, ctx) => {
    validatePublicationState(value, ctx);
    if (value.endDate && value.endDate < value.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate must be on or after date",
      });
    }
  });
export type ProgrammeImportantDateInput = z.infer<
  typeof ProgrammeImportantDateInputSchema
>;

export const ProgrammePublicProfileInputSchema = z.object({
  programmeId: z.string().trim().min(1),
  programmeName: z.string().trim().min(1).max(300),
  shortName: z.string().trim().min(1).max(80),
  overview: z.string().trim().default(""),
  admissionEmail: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  websiteUrl: optionalTrimmedUrl,
  facebookUrl: optionalTrimmedUrl,
  campusAddress: z.string().trim().max(1000).nullable().optional(),
  mapUrl: optionalTrimmedUrl,
  applicationUrl: optionalTrimmedUrl,
});
export type ProgrammePublicProfileInput = z.infer<
  typeof ProgrammePublicProfileInputSchema
>;
