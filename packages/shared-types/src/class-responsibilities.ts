import { z } from "zod";

export const ClassResponsibilityRoleSchema = z.enum(["ClassMonitor", "SubClassMonitor"]);
export type ClassResponsibilityRole = z.infer<typeof ClassResponsibilityRoleSchema>;

export const AssignClassResponsibilityInput = z.object({
  studentId: z.string().uuid(),
  role: ClassResponsibilityRoleSchema,
});
export type AssignClassResponsibilityInput = z.infer<typeof AssignClassResponsibilityInput>;

export const RevokeClassResponsibilityInput = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type RevokeClassResponsibilityInput = z.infer<typeof RevokeClassResponsibilityInput>;

export const ClassResponsibilityStudentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  studentId: z.string(),
  name: z.string(),
});

export const ClassResponsibilityActorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const ClassResponsibilityViewSchema = z.object({
  id: z.string().uuid(),
  offeringId: z.string().uuid(),
  role: ClassResponsibilityRoleSchema,
  student: ClassResponsibilityStudentSchema,
  assignedAt: z.string().datetime(),
  assignedBy: ClassResponsibilityActorSchema,
  revokedAt: z.string().datetime().nullable(),
  revokedBy: ClassResponsibilityActorSchema.nullable(),
  revokeReason: z.string(),
});
export type ClassResponsibilityView = z.infer<typeof ClassResponsibilityViewSchema>;

export const ClassResponsibilityAuditActionSchema = z.enum(["Assigned", "Revoked", "Reassigned"]);
export type ClassResponsibilityAuditAction = z.infer<typeof ClassResponsibilityAuditActionSchema>;

export const ClassResponsibilityAuditEventSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid().nullable(),
  offeringId: z.string().uuid(),
  studentId: z.string().uuid(),
  actor: ClassResponsibilityActorSchema,
  action: ClassResponsibilityAuditActionSchema,
  previousRole: ClassResponsibilityRoleSchema.nullable(),
  newRole: ClassResponsibilityRoleSchema.nullable(),
  reason: z.string(),
  details: z.unknown().nullable(),
  createdAt: z.string().datetime(),
});
export type ClassResponsibilityAuditEvent = z.infer<typeof ClassResponsibilityAuditEventSchema>;
