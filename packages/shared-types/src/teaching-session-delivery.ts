import { z } from "zod";
import {
  ClassDeliveryNoteSchema,
  LecturerArrivalConfirmationViewSchema,
  LecturerArrivalStatusSchema,
  TeachingSessionOccurrenceViewSchema,
} from "./class-delivery.ts";
import { ClassResponsibilityRoleSchema } from "./class-responsibilities.ts";

export const TeachingSessionCoverageSchema = z.enum([
  "TAUGHT_AS_PLANNED",
  "PARTIALLY_COVERED",
  "DIFFERENT_TOPIC",
  "NOT_COVERED",
]);
export type TeachingSessionCoverage = z.infer<typeof TeachingSessionCoverageSchema>;

export const TeachingSessionActualTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const TeachingSessionLearningSummarySchema = z.string().trim().max(1000);
export type TeachingSessionLearningSummary = z.infer<
  typeof TeachingSessionLearningSummarySchema
>;

export const SaveTeachingSessionDeliveryInputSchema = z
  .object({
    lecturerArrivalStatus: LecturerArrivalStatusSchema.nullable().optional(),
    classOccurred: z.boolean(),
    actualLecturerId: z.string().uuid().nullable().default(null),
    actualStartTime: TeachingSessionActualTimeSchema.nullable().default(null),
    actualEndTime: TeachingSessionActualTimeSchema.nullable().default(null),
    actualTopic: z.string().trim().max(1000).default(""),
    learningSummary: TeachingSessionLearningSummarySchema.optional(),
    coverage: TeachingSessionCoverageSchema,
    note: ClassDeliveryNoteSchema.optional().default(""),
  })
  .superRefine((value, ctx) => {
    if (!value.classOccurred) {
      if (value.actualLecturerId !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actualLecturerId"],
          message: "Actual lecturer must be empty when the class did not occur",
        });
      }
      if (value.actualStartTime !== null || value.actualEndTime !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actualStartTime"],
          message: "Actual times must be empty when the class did not occur",
        });
      }
      if (value.coverage !== "NOT_COVERED") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["coverage"],
          message: "A class that did not occur must use NOT_COVERED",
        });
      }
      if ((value.learningSummary ?? "").length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["learningSummary"],
          message: "Learning summary must be empty when the class did not occur",
        });
      }
      return;
    }

    if (!value.actualLecturerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualLecturerId"],
        message: "Actual lecturer is required when the class occurred",
      });
    }
    if (!value.actualStartTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualStartTime"],
        message: "Actual start time is required when the class occurred",
      });
    }
    if (!value.actualEndTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualEndTime"],
        message: "Actual end time is required when the class occurred",
      });
    }
    if (
      value.actualStartTime &&
      value.actualEndTime &&
      value.actualEndTime <= value.actualStartTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualEndTime"],
        message: "Actual end time must be after actual start time",
      });
    }
  });
export type SaveTeachingSessionDeliveryInput = z.infer<
  typeof SaveTeachingSessionDeliveryInputSchema
>;

export const TeachingSessionPlannedWeekViewSchema = z.object({
  courseSpecId: z.string().uuid(),
  id: z.string().uuid(),
  week: z.number().int().positive(),
  topic: z.string(),
});
export type TeachingSessionPlannedWeekView = z.infer<
  typeof TeachingSessionPlannedWeekViewSchema
>;

export const TeachingSessionDeliveryLecturerViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type TeachingSessionDeliveryLecturerView = z.infer<
  typeof TeachingSessionDeliveryLecturerViewSchema
>;

export const TeachingSessionDeliverySnapshotSchema = z.object({
  classOccurred: z.boolean(),
  actualLecturerId: z.string().uuid().nullable(),
  actualStartTime: TeachingSessionActualTimeSchema.nullable(),
  actualEndTime: TeachingSessionActualTimeSchema.nullable(),
  deliveredMinutes: z.number().int().min(0),
  actualTopic: z.string(),
  learningSummary: z.string(),
  coverage: TeachingSessionCoverageSchema,
  note: z.string(),
});
export type TeachingSessionDeliverySnapshot = z.infer<
  typeof TeachingSessionDeliverySnapshotSchema
>;

export const TeachingSessionDeliveryViewSchema = z.object({
  id: z.string().uuid(),
  occurrenceId: z.string().uuid(),
  offeringId: z.string().uuid(),
  classOccurred: z.boolean(),
  actualLecturer: TeachingSessionDeliveryLecturerViewSchema.nullable(),
  actualStartTime: TeachingSessionActualTimeSchema.nullable(),
  actualEndTime: TeachingSessionActualTimeSchema.nullable(),
  deliveredMinutes: z.number().int().min(0),
  deliveredContactHours: z.number().min(0),
  actualTopic: z.string(),
  learningSummary: z.string(),
  coverage: TeachingSessionCoverageSchema,
  note: z.string(),
  plannedWeek: TeachingSessionPlannedWeekViewSchema.nullable(),
  recordedBy: z.object({ id: z.string().uuid(), name: z.string() }),
  recordedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revision: z.number().int().positive(),
});
export type TeachingSessionDeliveryView = z.infer<
  typeof TeachingSessionDeliveryViewSchema
>;

export const TeachingSessionDeliveryAuditEventViewSchema = z.object({
  id: z.string().uuid(),
  deliveryId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
  revision: z.number().int().positive(),
  actor: z.object({ id: z.string().uuid(), name: z.string() }),
  previousSnapshot: TeachingSessionDeliverySnapshotSchema.nullable(),
  newSnapshot: TeachingSessionDeliverySnapshotSchema,
  createdAt: z.string().datetime(),
});
export type TeachingSessionDeliveryAuditEventView = z.infer<
  typeof TeachingSessionDeliveryAuditEventViewSchema
>;

export const MonitorClassResponsibilityViewSchema = z.object({
  offeringId: z.string().uuid(),
  role: ClassResponsibilityRoleSchema,
});
export type MonitorClassResponsibilityView = z.infer<
  typeof MonitorClassResponsibilityViewSchema
>;

export const TeachingSessionMonitorContextViewSchema = z.object({
  responsibility: MonitorClassResponsibilityViewSchema,
  occurrence: TeachingSessionOccurrenceViewSchema,
  plannedWeek: TeachingSessionPlannedWeekViewSchema.nullable(),
  eligibleLecturers: z.array(TeachingSessionDeliveryLecturerViewSchema),
  lecturerArrival: LecturerArrivalConfirmationViewSchema.nullable(),
  delivery: TeachingSessionDeliveryViewSchema.nullable(),
  history: z.array(TeachingSessionDeliveryAuditEventViewSchema),
});
export type TeachingSessionMonitorContextView = z.infer<
  typeof TeachingSessionMonitorContextViewSchema
>;

export const SaveTeachingSessionDeliveryResultSchema = z.object({
  delivery: TeachingSessionDeliveryViewSchema,
  changed: z.boolean(),
});
export type SaveTeachingSessionDeliveryResult = z.infer<
  typeof SaveTeachingSessionDeliveryResultSchema
>;
