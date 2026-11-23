import { z } from "zod";

export const OfferingActivityTypeSchema = z.enum([
  "field_visit", "industry_visit", "workshop", "guest_lecture", "other",
]);
export type OfferingActivityType = z.infer<typeof OfferingActivityTypeSchema>;
export const OfferingActivityStatusSchema = z.enum(["Draft", "Published", "Archived"]);
export type OfferingActivityStatus = z.infer<typeof OfferingActivityStatusSchema>;

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid calendar date");
const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();
export const OfferingActivityEvidenceLinkSchema = z.object({
  kind: z.enum(["photo_album", "report", "presentation", "other"]),
  label: z.string().trim().min(1).max(100),
  url: z.string().url().max(2048).refine((value) => value.startsWith("https://"), "Use an HTTPS evidence link"),
}).strict();
export type OfferingActivityEvidenceLink = z.infer<typeof OfferingActivityEvidenceLinkSchema>;
const Fields = {
  type: OfferingActivityTypeSchema,
  title: z.string().trim().min(1).max(160),
  date: DateOnly,
  startTime: TimeOfDay.default(null),
  endTime: TimeOfDay.default(null),
  host: z.string().trim().min(1).max(160),
  location: z.string().trim().max(240).default(""),
  description: z.string().trim().max(2000).default(""),
  objectives: z.string().trim().max(2000).default(""),
  reflectionPrompt: z.string().trim().max(1200).default(""),
  evidenceLinks: z.array(OfferingActivityEvidenceLinkSchema).max(12).default([]),
  status: OfferingActivityStatusSchema.default("Draft"),
};

export function validActivityTimeRange(start: string | null | undefined, end: string | null | undefined): boolean {
  return !start || !end || end > start;
}
export const CreateOfferingActivityInputSchema = z.object(Fields).strict().superRefine((value, ctx) => {
  if (value.status === "Archived") ctx.addIssue({ code: "custom", path: ["status"], message: "Cannot create an archived activity" });
  if (!validActivityTimeRange(value.startTime, value.endTime)) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time" });
  }
});
export type CreateOfferingActivityInput = z.infer<typeof CreateOfferingActivityInputSchema>;
export const UpdateOfferingActivityInputSchema = z.object(Fields).partial().extend({
  expectedVersion: z.number().int().positive(),
}).strict();
export type UpdateOfferingActivityInput = z.infer<typeof UpdateOfferingActivityInputSchema>;

export interface OfferingActivityView {
  id: string;
  offeringId: string;
  type: OfferingActivityType;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  host: string;
  location: string;
  description: string;
  objectives: string;
  reflectionPrompt: string;
  evidenceLinks: OfferingActivityEvidenceLink[];
  status: OfferingActivityStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface OfferingActivityAuditView {
  id: string;
  action: "created" | "updated" | "archived";
  actorId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}
