import { z } from "zod";

export const LecturerArrivalStatusSchema = z.enum(["Present", "NotYet"]);
export type LecturerArrivalStatus = z.infer<typeof LecturerArrivalStatusSchema>;

export const ClassSessionStatusSchema = z.enum([
  "Scheduled",
  "Holiday",
  "Cancelled",
  "Rescheduled",
  "Other",
]);
export type ClassSessionStatus = z.infer<typeof ClassSessionStatusSchema>;

export const ClassDeliveryNoteSchema = z.string().trim().max(500);
export type ClassDeliveryNote = z.infer<typeof ClassDeliveryNoteSchema>;

export const LecturerArrivalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type LecturerArrivalDate = z.infer<typeof LecturerArrivalDateSchema>;

export const SaveLecturerArrivalConfirmationInputSchema = z.object({
  status: LecturerArrivalStatusSchema,
  note: ClassDeliveryNoteSchema.optional().default(""),
});
export type SaveLecturerArrivalConfirmationInput = z.infer<typeof SaveLecturerArrivalConfirmationInputSchema>;

export const LecturerArrivalConfirmationViewSchema = z.object({
  id: z.string().uuid(),
  offeringId: z.string().uuid(),
  date: LecturerArrivalDateSchema,
  status: LecturerArrivalStatusSchema,
  note: ClassDeliveryNoteSchema,
  recordedBy: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  recordedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LecturerArrivalConfirmationView = z.infer<typeof LecturerArrivalConfirmationViewSchema>;

export const SaveLecturerArrivalConfirmationResultSchema = z.object({
  confirmation: LecturerArrivalConfirmationViewSchema,
  changed: z.boolean(),
});
export type SaveLecturerArrivalConfirmationResult = z.infer<typeof SaveLecturerArrivalConfirmationResultSchema>;

export const SaveClassSessionStatusInputSchema = z.object({
  status: ClassSessionStatusSchema,
  reason: ClassDeliveryNoteSchema.optional().default(""),
});
export type SaveClassSessionStatusInput = z.infer<typeof SaveClassSessionStatusInputSchema>;

export const ClassSessionStatusViewSchema = z.object({
  id: z.string().uuid(),
  offeringId: z.string().uuid(),
  date: LecturerArrivalDateSchema,
  status: ClassSessionStatusSchema,
  reason: ClassDeliveryNoteSchema,
  recordedBy: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  recordedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ClassSessionStatusView = z.infer<typeof ClassSessionStatusViewSchema>;

export const SaveClassSessionStatusResultSchema = z.object({
  session: ClassSessionStatusViewSchema,
  changed: z.boolean(),
});
export type SaveClassSessionStatusResult = z.infer<typeof SaveClassSessionStatusResultSchema>;
