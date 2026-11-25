import { z } from "zod";

const namePart = z.string().trim().min(1).max(100).refine(
  (value) => !/[\u0000-\u001F\u007F]/.test(value),
  "Control characters are not allowed",
);

// No applicant-selected role, Telegram ID, programme ID, status, or phone data.
export const TelegramStudentRegistrationInputSchema = z.object({
  verificationId: z.string().uuid(),
  khmerFamilyName: namePart,
  khmerGivenName: namePart,
  latinFamilyName: namePart,
  latinGivenName: namePart,
  cohortId: z.string().trim().min(1).max(100),
  sectionId: z.string().trim().min(1).max(100),
  officialStudentId: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().max(254).email().optional(),
}).strict();

export type TelegramStudentRegistrationInput = z.infer<
  typeof TelegramStudentRegistrationInputSchema
>;

export type PendingRegistrationReceipt = {
  requestId: string;
  status: "PENDING";
};
