import { z } from "zod";

export const ProgrammePublicPublicationStatusSchema = z.enum([
  "Draft",
  "Published",
]);
export type ProgrammePublicPublicationStatus = z.infer<
  typeof ProgrammePublicPublicationStatusSchema
>;

export const PublicProgrammeLocaleSchema = z.enum(["en", "km"]);
export type PublicProgrammeLocale = z.infer<typeof PublicProgrammeLocaleSchema>;

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

const optionalTrimmedUrl = z.string().trim().url().nullable().optional();

const publicationFields = {
  status: ProgrammePublicPublicationStatusSchema.default("Draft"),
  publishedAt: z.coerce.date().nullable().optional(),
};

function validatePublicationState(
  value: {
    status: ProgrammePublicPublicationStatus;
    publishedAt?: Date | null;
  },
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
    titleKm: z.string().trim().max(200).nullable().optional(),
    descriptionKm: z.string().trim().max(2000).nullable().optional(),
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
  programmeNameKm: z.string().trim().max(300).nullable().optional(),
  shortNameKm: z.string().trim().max(80).nullable().optional(),
  overviewKm: z.string().trim().nullable().optional(),
  admissionEmail: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  websiteUrl: optionalTrimmedUrl,
  facebookUrl: optionalTrimmedUrl,
  campusAddress: z.string().trim().max(1000).nullable().optional(),
  campusAddressKm: z.string().trim().max(1000).nullable().optional(),
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
  questionKm: z.string().trim().max(500).nullable().optional(),
  answerKm: z.string().trim().nullable().optional(),
  shortAnswerKm: z.string().trim().max(1000).nullable().optional(),
  keywordsKm: z.array(z.string().trim().min(1).max(80)).default([]),
  sortOrder: z.number().int().min(0).default(0),
  isFeatured: z.boolean().default(false),
  sourceLabel: z.string().trim().max(200).nullable().optional(),
  sourceUrl: optionalTrimmedUrl,
  reviewedAt: z.coerce.date().nullable().optional(),
});
export type ProgrammeFaqAdminWrite = z.infer<
  typeof ProgrammeFaqAdminWriteSchema
>;

export const ProgrammeImportantDateAdminWriteSchema = z
  .object({
    kind: ProgrammeImportantDateKindSchema,
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(2000).default(""),
    titleKm: z.string().trim().max(200).nullable().optional(),
    descriptionKm: z.string().trim().max(2000).nullable().optional(),
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
  programmeName: z
    .string()
    .trim()
    .min(1, "Programme name is required")
    .max(300),
  shortName: z.string().trim().min(1, "Short name is required").max(80),
  overview: z.string().trim().default(""),
  programmeNameKm: z.string().trim().max(300).nullable().optional(),
  shortNameKm: z.string().trim().max(80).nullable().optional(),
  overviewKm: z.string().trim().nullable().optional(),
  admissionEmail: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  websiteUrl: optionalTrimmedUrl,
  facebookUrl: optionalTrimmedUrl,
  campusAddress: z.string().trim().max(1000).nullable().optional(),
  campusAddressKm: z.string().trim().max(1000).nullable().optional(),
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

/** Published-only, channel-neutral public contracts. These deliberately omit
 * database ids, programme ids, lifecycle timestamps, search keywords, review
 * metadata, and admin timestamps so public channels receive only display data. */
export const PublicProgrammeFaqSchema = z.object({
  slug: slugSchema,
  category: ProgrammeFaqCategorySchema,
  question: z.string(),
  answer: z.string(),
  shortAnswer: z.string().nullable(),
  isFeatured: z.boolean(),
  sourceLabel: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),
});
export type PublicProgrammeFaq = z.infer<typeof PublicProgrammeFaqSchema>;

export const PublicProgrammeImportantDateSchema = z.object({
  kind: ProgrammeImportantDateKindSchema,
  title: z.string(),
  description: z.string(),
  date: z.string(),
  endDate: z.string().nullable(),
});
export type PublicProgrammeImportantDate = z.infer<
  typeof PublicProgrammeImportantDateSchema
>;

export const PublicProgrammeProfileSchema = z.object({
  programmeName: z.string(),
  shortName: z.string(),
  overview: z.string(),
  admissionEmail: z.string().email().nullable(),
  phone: z.string().nullable(),
  websiteUrl: z.string().url().nullable(),
  facebookUrl: z.string().url().nullable(),
  campusAddress: z.string().nullable(),
  mapUrl: z.string().url().nullable(),
  applicationUrl: z.string().url().nullable(),
});
export type PublicProgrammeProfile = z.infer<
  typeof PublicProgrammeProfileSchema
>;

export const PublicProgrammeContactSchema = PublicProgrammeProfileSchema.pick({
  admissionEmail: true,
  phone: true,
  websiteUrl: true,
  facebookUrl: true,
  campusAddress: true,
  mapUrl: true,
  applicationUrl: true,
});
export type PublicProgrammeContact = z.infer<
  typeof PublicProgrammeContactSchema
>;

export const PublicProgrammeFaqCategorySummarySchema = z.object({
  category: ProgrammeFaqCategorySchema,
  count: z.number().int().nonnegative(),
});
export type PublicProgrammeFaqCategorySummary = z.infer<
  typeof PublicProgrammeFaqCategorySummarySchema
>;

export const PublicProgrammeAdmissionSchema = z.object({
  applicationUrl: z.string().url().nullable(),
  admissionEmail: z.string().email().nullable(),
  phone: z.string().nullable(),
  faqs: z.array(PublicProgrammeFaqSchema),
});
export type PublicProgrammeAdmission = z.infer<
  typeof PublicProgrammeAdmissionSchema
>;

export const PublicProgrammeFeesScholarshipsSchema = z.object({
  faqs: z.array(PublicProgrammeFaqSchema),
});
export type PublicProgrammeFeesScholarships = z.infer<
  typeof PublicProgrammeFeesScholarshipsSchema
>;

export const PublicProgrammeLocaleQuerySchema = z.object({
  locale: PublicProgrammeLocaleSchema.optional(),
});
export type PublicProgrammeLocaleQuery = z.infer<
  typeof PublicProgrammeLocaleQuerySchema
>;

export const PublicProgrammeFaqQuerySchema = z.object({
  category: ProgrammeFaqCategorySchema.optional(),
  featured: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  locale: PublicProgrammeLocaleSchema.optional(),
});
export type PublicProgrammeFaqQuery = z.infer<
  typeof PublicProgrammeFaqQuerySchema
>;

export const PublicProgrammeImportantDateQuerySchema = z.object({
  kind: ProgrammeImportantDateKindSchema.optional(),
  locale: PublicProgrammeLocaleSchema.optional(),
});
export type PublicProgrammeImportantDateQuery = z.infer<
  typeof PublicProgrammeImportantDateQuerySchema
>;
