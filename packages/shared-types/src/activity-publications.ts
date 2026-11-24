import { z } from "zod";

export const VisitCheckpointSchema = z.enum(["Unknown", "Marked", "NotMarked"]);
export const VisitFarmStatusSchema = z.enum(["Unverified", "Confirmed", "NotAttended"]);
export const VisitSourceSchema = z.enum(["Manual", "PaperTripSheet", "HostVerified"]);
export const VisitExternalRoleSchema = z.enum(["Staff", "Assistant", "Guest", "Other"]);

export const CreateVisitParticipantSchema = z.object({
  studentId: z.string().uuid().optional(),
  externalName: z.string().trim().min(2).max(160).optional(),
  externalRole: VisitExternalRoleSchema.optional(),
  goStatus: VisitCheckpointSchema.default("Unknown"),
  returnStatus: VisitCheckpointSchema.default("Unknown"),
  farmStatus: VisitFarmStatusSchema.default("Unverified"),
  source: VisitSourceSchema.default("Manual"),
  note: z.string().trim().max(500).default(""),
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.studentId) === Boolean(value.externalName)) {
    ctx.addIssue({ code: "custom", path: ["studentId"], message: "Choose exactly one enrolled student or external visitor" });
  }
  if (value.studentId && value.externalRole) {
    ctx.addIssue({ code: "custom", path: ["externalRole"], message: "External role is only for non-enrolled participants" });
  }
  if (value.farmStatus === "Confirmed" && value.source !== "HostVerified") {
    ctx.addIssue({ code: "custom", path: ["farmStatus"], message: "Travel sheet alone cannot confirm presence at Sindora" });
  }
});
export const UpdateVisitParticipantSchema = z.object({
  expectedVersion: z.number().int().positive(),
  goStatus: VisitCheckpointSchema.optional(),
  returnStatus: VisitCheckpointSchema.optional(),
  farmStatus: VisitFarmStatusSchema.optional(),
  source: VisitSourceSchema.optional(),
  externalRole: VisitExternalRoleSchema.nullable().optional(),
  note: z.string().trim().max(500).optional(),
}).strict();
export type CreateVisitParticipantInput = z.infer<typeof CreateVisitParticipantSchema>;
export type UpdateVisitParticipantInput = z.infer<typeof UpdateVisitParticipantSchema>;

export interface VisitRosterStudent {
  id: string;
  name: string;
  studentNumber: string | null;
}
export interface VisitParticipantView {
  id: string;
  activityId: string;
  studentId: string | null;
  studentName: string | null;
  externalName: string | null;
  externalRole: string | null;
  goStatus: z.infer<typeof VisitCheckpointSchema>;
  returnStatus: z.infer<typeof VisitCheckpointSchema>;
  farmStatus: z.infer<typeof VisitFarmStatusSchema>;
  source: z.infer<typeof VisitSourceSchema>;
  note: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface VisitParticipantsWorkspace {
  roster: VisitRosterStudent[];
  participants: VisitParticipantView[];
}

const HttpsUrl = z.string().url().max(2048).refine((url) => url.startsWith("https://"), "HTTPS URL required");
export const NewsMediaSchema = z.object({
  url: HttpsUrl,
  alt: z.string().trim().min(3).max(250),
}).strict();
const NewsFields = {
  title: z.string().trim().min(8).max(180),
  summary: z.string().trim().max(350).default(""),
  body: z.string().trim().min(20).max(12000),
  activityId: z.string().uuid().nullable().default(null),
  coverImageUrl: HttpsUrl.nullable().default(null),
  coverAlt: z.string().trim().max(250).default(""),
  gallery: z.array(NewsMediaSchema).max(8).default([]),
  tags: z.array(z.string().trim().min(2).max(35)).max(6).default([]),
  mediaApproved: z.boolean().default(false),
};
export const CreateDseNewsSchema = z.object(NewsFields).strict().superRefine((value, ctx) => {
  if (value.coverImageUrl && value.coverAlt.length < 3) {
    ctx.addIssue({ code: "custom", path: ["coverAlt"], message: "Cover image needs descriptive alt text" });
  }
});
export const EditDseNewsSchema = z.object(NewsFields).partial().extend({
  expectedVersion: z.number().int().positive(),
}).strict();
export const ChangeDseNewsStatusSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.enum(["Draft", "Published", "Archived"]),
}).strict();
export type CreateDseNewsInput = z.infer<typeof CreateDseNewsSchema>;
export type EditDseNewsInput = z.infer<typeof EditDseNewsSchema>;
export type ChangeDseNewsStatusInput = z.infer<typeof ChangeDseNewsStatusSchema>;
export interface DseNewsUploadedMedia {
  id: string;
  kind: "cover" | "gallery";
  url: string;
  thumbnailUrl: string;
  alt: string;
  width: number;
  height: number;
  bytes: number;
}
export interface DseNewsView {
  id: string;
  programmeId: string;
  activityId: string | null;
  title: string;
  summary: string;
  body: string;
  coverImageUrl: string | null;
  coverAlt: string;
  gallery: z.infer<typeof NewsMediaSchema>[];
  uploadedMedia: DseNewsUploadedMedia[];
  tags: string[];
  mediaApproved: boolean;
  status: "Draft" | "Published" | "Archived";
  version: number;
  authorName: string;
  publishedAt: string | null;
  publicPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export function canPublishDseNews(input: { body: string; coverImageUrl: string | null; gallery: unknown[]; mediaApproved: boolean }): boolean {
  return input.body.trim().length >= 80 &&
    ((!input.coverImageUrl && input.gallery.length === 0) || input.mediaApproved);
}

/** Deliberately narrow, anonymous-safe article projection; no offering, roster or private object path. */
export interface PublicDseNewsArticle {
  id: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  publishedAt: string;
  publicPublishedAt: string;
  cover: { url: string; alt: string } | null;
  gallery: { url: string; alt: string }[];
}
export const DseNewsPublicApprovalSchema = z.object({
  expectedVersion: z.number().int().positive(),
  public: z.boolean(),
  confirmPhotoRights: z.boolean().default(false),
}).strict();
export type DseNewsPublicApprovalInput = z.infer<typeof DseNewsPublicApprovalSchema>;
