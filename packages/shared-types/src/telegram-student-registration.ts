import { z } from "zod";
import { StudentCareerProfileSchema } from "./student-career-profile.ts";

export const UniversityEmailSchema = z.string().trim().max(254).email().refine(value => /^[^@\s]+@rupp\.edu\.kh$/i.test(value), "Use your university email ending in @rupp.edu.kh").transform(value => value.toLowerCase());

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
  email: UniversityEmailSchema,
  careerProfile: StudentCareerProfileSchema.optional(),
}).strict();

export type TelegramStudentRegistrationInput = z.infer<
  typeof TelegramStudentRegistrationInputSchema
>;

export type PendingRegistrationReceipt = {
  requestId: string;
  status: "PENDING";
};

export const TelegramRegistrationStatusSchema = z.enum(["PENDING", "NEEDS_CORRECTION", "APPROVED", "REJECTED"]);
export type TelegramRegistrationStatus = z.infer<typeof TelegramRegistrationStatusSchema>;
export const TelegramRegistrationReviewSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("APPROVE"), studentId: z.string().trim().min(1).max(100), identityConfirmed: z.literal(true), reason: z.string().trim().min(10).max(500) }).strict(),
  z.object({ decision: z.enum(["REJECT", "REQUEST_CORRECTION"]), reason: z.string().trim().min(10).max(500) }).strict(),
]);
export type TelegramRegistrationReviewInput = z.infer<typeof TelegramRegistrationReviewSchema>;
export type TelegramRegistrationPlacement = { cohortId: string; cohortCode: string; cohortName: string; sectionId: string; sectionCode: string };
export type TelegramRegistrationBootstrap = {
  verificationId: string; expiresAt: string;
  state: "FORM" | "BOT_REQUIRED" | "EXISTING_ACCOUNT" | TelegramRegistrationStatus;
  placements: TelegramRegistrationPlacement[];
};
export type TelegramRegistrationStaffRow = {
  id: string; status: TelegramRegistrationStatus; khmerFamilyName: string; khmerGivenName: string;
  latinFamilyName: string; latinGivenName: string; cohortId: string; cohortCode: string; sectionCode: string;
  officialStudentId: string | null; email: string | null; telegramPhone: string | null;
  createdAt: string; updatedAt: string;
};
export type TelegramRegistrationRosterCandidate = {
  id: string; name: string; studentId: string | null; email: string | null; hasAccount: boolean; canActivate: boolean;
};
