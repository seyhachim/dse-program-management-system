import { z } from "zod";

/**
 * Student domain schemas. Defined once here and imported by both the backend
 * (request validation + Prisma boundary) and the frontend (form validation),
 * so the wire contract stays identical on both ends.
 */

export const STUDENT_STATUSES = ["Active", "Inactive", "Pending"] as const;
export const StudentStatusSchema = z.enum(STUDENT_STATUSES);
export type StudentStatus = z.infer<typeof StudentStatusSchema>;

const nullableText = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  },
  z.string().min(1).nullable(),
);

/**
 * Roster records may exist before a portal/login email is known. Blank form
 * values normalize to null; any supplied value must still be a valid email.
 */
export const StudentEmailSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  },
  z.string().email("Valid email required").nullable(),
);

export const StudentProfileInputSchema = z
  .object({
    khmerFamilyName: nullableText.optional(),
    khmerGivenName: nullableText.optional(),
    latinFamilyName: nullableText.optional(),
    latinGivenName: nullableText.optional(),
    gender: nullableText.optional(),
  })
  .strict();
export type StudentProfileInput = z.infer<typeof StudentProfileInputSchema>;

export const StudentProfileSchema = StudentProfileInputSchema.extend({
  id: z.string().uuid(),
  studentRecordId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StudentProfile = z.infer<typeof StudentProfileSchema>;

/** Full student as returned by the API. */
export const StudentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: StudentEmailSchema,
  studentId: z.string().min(1),
  status: StudentStatusSchema,
  createdAt: z.string().datetime(),
  // Optional for compatibility with consumers that only need the core roster
  // fields; the Students management API includes this relation when available.
  profile: StudentProfileSchema.nullable().optional(),
});
export type Student = z.infer<typeof StudentSchema>;

const StudentCoreWriteInput = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: StudentEmailSchema,
  studentId: z.string().trim().min(1, "Student ID is required"),
  status: StudentStatusSchema.default("Active"),
});

/** Body for POST /api/students. */
export const CreateStudentInput = StudentCoreWriteInput.extend({
  profile: StudentProfileInputSchema.optional(),
});
export type CreateStudentInput = z.infer<typeof CreateStudentInput>;

/** Body for PATCH /api/students/:id — all core/profile fields optional. */
export const UpdateStudentInput = StudentCoreWriteInput.partial().extend({
  profile: StudentProfileInputSchema.partial().optional(),
});
export type UpdateStudentInput = z.infer<typeof UpdateStudentInput>;

/** Body for PATCH /api/students/:id/status. */
export const SetStudentStatusInput = z.object({
  status: StudentStatusSchema,
});
export type SetStudentStatusInput = z.infer<typeof SetStudentStatusInput>;

/** Query params for the legacy GET /api/students list. */
export const ListStudentsQuery = z.object({
  search: z.string().trim().optional(),
  activeOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) => v === true || v === "true"),
});
export type ListStudentsQuery = z.infer<typeof ListStudentsQuery>;

/**
 * Query params for the bounded interactive roster read.
 *
 * The cursor is intentionally opaque to clients. The backend encodes the
 * stable `(createdAt, id)` sort position so equal timestamps and concurrent
 * inserts cannot make interactive page navigation skip or duplicate rows.
 */
export const ListStudentsPageQuery = ListStudentsQuery.extend({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListStudentsPageQuery = z.infer<typeof ListStudentsPageQuery>;

export interface StudentPage {
  items: Student[];
  nextCursor: string | null;
}
