import { z } from "zod";

export const GuardianRelationshipType = z.enum([
  "MOTHER",
  "FATHER",
  "LEGAL_GUARDIAN",
  "OTHER_AUTHORIZED_GUARDIAN",
]);
export type GuardianRelationshipType = z.infer<typeof GuardianRelationshipType>;

export const GuardianRelationshipStatus = z.enum([
  "PENDING",
  "VERIFIED",
  "REVOKED",
  "ENDED",
]);
export type GuardianRelationshipStatus = z.infer<typeof GuardianRelationshipStatus>;

export const GuardianAccessScope = z.enum([
  "attendance",
  "academic_status",
  "official_results",
  "announcements",
  "academic_calendar",
  "support_cases",
  "meeting_requests",
  "parent_feedback",
]);
export type GuardianAccessScope = z.infer<typeof GuardianAccessScope>;

export const CreateGuardianRelationshipInput = z.object({
  guardianUserId: z.string().uuid(),
  studentId: z.string().uuid(),
  programmeId: z.string().trim().min(1),
  relationshipType: GuardianRelationshipType,
  accessScopes: z.array(GuardianAccessScope).min(1).transform((values) => [...new Set(values)]),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable().optional(),
  verificationMethod: z.string().trim().max(120).nullable().optional(),
  verificationNotes: z.string().trim().max(1000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.effectiveTo && new Date(value.effectiveTo) <= new Date(value.effectiveFrom)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "effectiveTo must be after effectiveFrom",
    });
  }
});
export type CreateGuardianRelationshipInput = z.infer<typeof CreateGuardianRelationshipInput>;

export const UpdateGuardianRelationshipInput = z.object({
  relationshipType: GuardianRelationshipType.optional(),
  accessScopes: z.array(GuardianAccessScope).min(1).transform((values) => [...new Set(values)]).optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
});
export type UpdateGuardianRelationshipInput = z.infer<typeof UpdateGuardianRelationshipInput>;

const QueryBoolean = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const GuardianRelationshipListQuery = z.object({
  programmeId: z.string().trim().min(1),
  studentId: z.string().uuid().optional(),
  guardianUserId: z.string().uuid().optional(),
  includeInactive: QueryBoolean.default(false),
});
export type GuardianRelationshipListQuery = z.infer<typeof GuardianRelationshipListQuery>;

export interface GuardianRelationshipView {
  id: string;
  guardianUserId: string;
  guardianName: string;
  guardianEmail: string;
  studentId: string;
  studentName: string;
  studentInstitutionalId: string;
  programmeId: string;
  relationshipType: GuardianRelationshipType;
  status: GuardianRelationshipStatus;
  accessScopes: GuardianAccessScope[];
  effectiveFrom: string;
  effectiveTo: string | null;
  verifiedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuardianLinkedStudentView {
  relationshipId: string;
  studentId: string;
  studentName: string;
  studentInstitutionalId: string;
  programmeId: string;
  relationshipType: GuardianRelationshipType;
  accessScopes: GuardianAccessScope[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

export type ParentAttendanceHealthState = "healthy" | "watch" | "warning" | "recovery";
export type ParentAttendanceWarningLevel = "watch" | "warning";

export interface ParentAttendanceWarning {
  offeringId: string;
  courseCode: string;
  kind: "attendance" | "punctuality";
  level: ParentAttendanceWarningLevel;
  count: number;
  message: string;
}

export interface ParentAttendanceSummary {
  relationshipId: string;
  studentId: string;
  programmeId: string;
  totalSessions: number;
  markedSessions: number;
  attendanceRate: number | null;
  counts: {
    Present: number;
    Absent: number;
    Late: number;
    Excused: number;
    PermissionPending: number;
  };
  healthState: ParentAttendanceHealthState;
  warnings: ParentAttendanceWarning[];
}

export const ParentAcademicStatus = z.enum([
  "ON_TRACK",
  "NEEDS_ATTENTION",
  "UNAVAILABLE",
]);
export type ParentAcademicStatus = z.infer<typeof ParentAcademicStatus>;

export interface ParentOfficialCourseResult {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  sectionCode: string;
  totalGrade: number;
  finalizedAt: string;
}

export interface ParentAcademicProgressSummary {
  relationshipId: string;
  studentId: string;
  programmeId: string;
  academicStatus: ParentAcademicStatus;
  progressionStatus: string | null;
  academicYear: string | null;
  programmeYear: number | null;
  officialResults: ParentOfficialCourseResult[];
}
