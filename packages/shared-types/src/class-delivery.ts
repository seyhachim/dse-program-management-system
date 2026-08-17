import { z } from "zod";

export const LecturerArrivalStatusSchema = z.enum(["Present", "NotYet"]);
export type LecturerArrivalStatus = z.infer<typeof LecturerArrivalStatusSchema>;

export const LecturerArrivalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type LecturerArrivalDate = z.infer<typeof LecturerArrivalDateSchema>;

export const SaveLecturerArrivalConfirmationInputSchema = z.object({
  status: LecturerArrivalStatusSchema,
});
export type SaveLecturerArrivalConfirmationInput = z.infer<typeof SaveLecturerArrivalConfirmationInputSchema>;

export const LecturerArrivalConfirmationViewSchema = z.object({
  id: z.string().uuid(),
  offeringId: z.string().uuid(),
  date: LecturerArrivalDateSchema,
  status: LecturerArrivalStatusSchema,
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
