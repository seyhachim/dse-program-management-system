import { z } from "zod";
import { DateOnlySchema } from "./offerings.ts";

export const OFFERING_ACTIVATION_EXCEPTION_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "RESOLVED",
  "REVOKED",
  "EXPIRED",
] as const;
export const OfferingActivationExceptionStatusSchema = z.enum(
  OFFERING_ACTIVATION_EXCEPTION_STATUSES,
);
export type OfferingActivationExceptionStatus = z.infer<
  typeof OfferingActivationExceptionStatusSchema
>;

export const OFFERING_ACTIVATION_EXCEPTION_MISSING_ITEMS = [
  "CURRICULUM",
  "COURSE_SPEC",
] as const;
export const OfferingActivationExceptionMissingItemSchema = z.enum(
  OFFERING_ACTIVATION_EXCEPTION_MISSING_ITEMS,
);
export type OfferingActivationExceptionMissingItem = z.infer<
  typeof OfferingActivationExceptionMissingItemSchema
>;

export const OFFERING_ACTIVATION_EXCEPTION_AUDIT_ACTIONS = [
  "Requested",
  "Approved",
  "Rejected",
  "Revoked",
  "Resolved",
  "Expired",
] as const;
export const OfferingActivationExceptionAuditActionSchema = z.enum(
  OFFERING_ACTIVATION_EXCEPTION_AUDIT_ACTIONS,
);
export type OfferingActivationExceptionAuditAction = z.infer<
  typeof OfferingActivationExceptionAuditActionSchema
>;

const ExceptionReasonSchema = z
  .string()
  .trim()
  .min(10, "Explain why teaching must begin before documentation is complete")
  .max(2000, "Reason must be 2000 characters or fewer");

export const RequestOfferingActivationExceptionInputSchema = z.object({
  reason: ExceptionReasonSchema,
  documentationDueDate: DateOnlySchema,
});
export type RequestOfferingActivationExceptionInput = z.infer<
  typeof RequestOfferingActivationExceptionInputSchema
>;

export const ReviewOfferingActivationExceptionInputSchema = z.object({
  decision: z.enum(["Approve", "Reject"]),
  note: z.string().trim().max(2000, "Review note must be 2000 characters or fewer").default(""),
});
export type ReviewOfferingActivationExceptionInput = z.infer<
  typeof ReviewOfferingActivationExceptionInputSchema
>;

export const RevokeOfferingActivationExceptionInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "A revocation reason is required")
    .max(2000, "Revocation reason must be 2000 characters or fewer"),
});
export type RevokeOfferingActivationExceptionInput = z.infer<
  typeof RevokeOfferingActivationExceptionInputSchema
>;

export const ResolveOfferingActivationExceptionInputSchema = z.object({
  note: z.string().trim().max(2000, "Resolution note must be 2000 characters or fewer").default(""),
});
export type ResolveOfferingActivationExceptionInput = z.infer<
  typeof ResolveOfferingActivationExceptionInputSchema
>;

export interface OfferingActivationExceptionActorRef {
  id: string;
  name: string;
}

export interface OfferingActivationExceptionView {
  id: string;
  offeringId: string;
  status: OfferingActivationExceptionStatus;
  missingItems: OfferingActivationExceptionMissingItem[];
  reason: string;
  documentationDueDate: string;
  requestedBy: OfferingActivationExceptionActorRef;
  requestedAt: string;
  reviewedBy: OfferingActivationExceptionActorRef | null;
  reviewedAt: string | null;
  reviewNote: string;
  resolvedAt: string | null;
  revokedAt: string | null;
  expiredAt: string | null;
}

export interface OfferingActivationExceptionAuditEvent {
  id: string;
  exceptionId: string;
  offeringId: string;
  actor: OfferingActivationExceptionActorRef | null;
  action: OfferingActivationExceptionAuditAction;
  reason: string;
  details: unknown | null;
  createdAt: string;
}

export interface OfferingActivationExceptionReadiness {
  normalReady: boolean;
  canRequest: boolean;
  missingItems: OfferingActivationExceptionMissingItem[];
  teachingStart: string;
  teachingEnd: string;
  academicCalendarRevision: number;
}

export interface OfferingActivationExceptionSnapshot {
  offeringId: string;
  offeringStatus: "Planned" | "Active" | "Completed";
  current: OfferingActivationExceptionView | null;
  latest: OfferingActivationExceptionView | null;
  readiness: OfferingActivationExceptionReadiness;
  history: OfferingActivationExceptionAuditEvent[];
}
