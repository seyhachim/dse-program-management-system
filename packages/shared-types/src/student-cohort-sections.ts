import { z } from "zod";

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const CreateStudentCohortSectionInput = z.object({
  cohortId: z.string().uuid(),
  code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(160),
});
export type CreateStudentCohortSectionInput = z.infer<typeof CreateStudentCohortSectionInput>;

export const UpdateStudentCohortSectionInput = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export type UpdateStudentCohortSectionInput = z.infer<typeof UpdateStudentCohortSectionInput>;

export const ListStudentCohortSectionsQuery = z.object({
  cohortId: z.string().uuid(),
  activeOnly: z.coerce.boolean().optional().default(false),
});
export type ListStudentCohortSectionsQuery = z.infer<typeof ListStudentCohortSectionsQuery>;

export const AddStudentCohortSectionMembershipInput = z.object({
  studentId: z.string().uuid(),
  joinedAt: DateOnlySchema,
  note: z.string().trim().max(1000).default(""),
});
export type AddStudentCohortSectionMembershipInput = z.infer<typeof AddStudentCohortSectionMembershipInput>;

export const ExitStudentCohortSectionMembershipInput = z.object({
  exitedAt: DateOnlySchema,
  note: z.string().trim().max(1000).optional(),
});
export type ExitStudentCohortSectionMembershipInput = z.infer<typeof ExitStudentCohortSectionMembershipInput>;

export interface StudentCohortSectionView {
  id: string;
  cohortId: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  activeMembershipCount: number;
}

export interface StudentCohortSectionMembershipView {
  id: string;
  sectionId: string;
  cohortId: string;
  studentId: string;
  joinedAt: string;
  exitedAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  section: {
    id: string;
    code: string;
    name: string;
    active: boolean;
  };
}

export interface StudentCohortSectionMemberView {
  studentId: string;
  studentNumber: string;
  studentName: string;
  cohortJoinedAt: string;
  cohortExitedAt: string | null;
  currentSectionMembership: StudentCohortSectionMembershipView | null;
}
