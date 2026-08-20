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

/** Admin writes do not control lifecycle timestamps directly. Publish/unpublish
 * are explicit actions so the backend remains authoritative for `publishedAt`. */
export const ProgrammeFaqAdminWriteSchema = z.object({
  category: ProgrammeFaqCategorySchema,
  slug: slugSchema,
  question: z.string().trim().min(1, "Question is required").max(500),
  answer: z.string().trim().min(1, "Answer is required"),
  shortAnswer: z.string().trim().max(1000).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).default([]),
  sortOrder: z.number().int().min(0).default(0),
  isFeatured: z.boolean().default(false),
  sourceLabel: z.string().trim().max(200).nullable().optional(),
  sourceUrl: optionalTrimmedUrl,
  reviewedAt: z.coerce.date().nullable().optional(),
});
export type ProgrammeFaqAdminWrite = z.infer<typeof ProgrammeFaqAdminWriteSchema>;

export const ProgrammeImportantDateAdminWriteSchema = z
  .object({
    kind: ProgrammeImportantDateKindSchema,
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(2000).default(""),
    date: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.endDate && value.endDate < value.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate must be on or after date",
      });
    }
  });
export type ProgrammeImportantDateAdminWrite = z.infer<
  typeof ProgrammeImportantDateAdminWriteSchema
>;

export const ProgrammePublicProfileAdminWriteSchema = z.object({
  programmeName: z.string().trim().min(1, "Programme name is required").max(300),
  shortName: z.string().trim().min(1, "Short name is required").max(80),
  overview: z.string().trim().default(""),
  admissionEmail: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  websiteUrl: optionalTrimmedUrl,
  facebookUrl: optionalTrimmedUrl,
  campusAddress: z.string().trim().max(1000).nullable().optional(),
  mapUrl: optionalTrimmedUrl,
  applicationUrl: optionalTrimmedUrl,
});
export type ProgrammePublicProfileAdminWrite = z.infer<
  typeof ProgrammePublicProfileAdminWriteSchema
>;

export type ProgrammeFaqRecord = ProgrammeFaqAdminWrite & {
  id: string;
  programmeId: string;
  status: ProgrammePublicPublicationStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProgrammeImportantDateRecord = Omit<
  ProgrammeImportantDateAdminWrite,
  "date" | "endDate"
> & {
  id: string;
  programmeId: string;
  date: string;
  endDate: string | null;
  status: ProgrammePublicPublicationStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProgrammePublicProfileRecord = ProgrammePublicProfileAdminWrite & {
  id: string;
  programmeId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProgrammePublicInfoOverview = {
  programmeId: string;
  faqTotal: number;
  faqPublished: number;
  faqDraft: number;
  importantDateTotal: number;
  importantDatePublished: number;
  importantDateDraft: number;
  hasProfile: boolean;
};
