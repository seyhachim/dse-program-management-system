import { z } from "zod";

/** Optional form of address. Never inferred from gender. */
export const UserHonorificSchema = z.enum(["Mr", "Ms", "Mrs", "Mx", "Dr", "Prof"]);
export type UserHonorific = z.infer<typeof UserHonorificSchema>;

export const USER_HONORIFIC_LABELS: Record<UserHonorific, string> = {
  Mr: "Mr.",
  Ms: "Ms.",
  Mrs: "Mrs.",
  Mx: "Mx.",
  Dr: "Dr.",
  Prof: "Prof.",
};

export function formatLecturerDisplayName(
  name: string,
  honorific: UserHonorific | null | undefined,
): string {
  return honorific ? `${USER_HONORIFIC_LABELS[honorific]} ${name}` : name;
}

/**
 * Existing structured professional metadata stored in LecturerProfile.
 * `legacyCoursesTaught` is migration/history evidence only; current teaching
 * must always be derived from Course/Offering assignments.
 */
export const LecturerProfessionalProfileSchema = z.object({
  gender: z.string().nullable(),
  employmentType: z.string().nullable(),
  fieldOfSpecialization: z.string().nullable(),
  yearsOfExperience: z.number().int().min(0).nullable(),
  legacyCoursesTaught: z.string().nullable(),
});
export type LecturerProfessionalProfile = z.infer<typeof LecturerProfessionalProfileSchema>;

/**
 * Lecturers are Users with role = lecturer, surfaced via the Lecturers plugin.
 * Courses and Offerings consume this through registry.get('lecturers').
 *
 * honorific is an optional form of address; title remains the academic position.
 * title / qualification / phone populate the syllabus "Course Details" block
 * (§6–9) so an offering's syllabus can auto-fill instructor info.
 */
export const LecturerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  honorific: UserHonorificSchema.nullable().optional(),
  title: z.string().nullable().optional(),
  qualification: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  professionalProfile: LecturerProfessionalProfileSchema.nullable(),
  /**
   * Whether this lecturer profile is linked to a provisioned Supabase Auth
   * identity. We intentionally do not label this "active" vs "invited" because
   * the app does not persist a reliable invite-acceptance state yet.
   */
  accountAccess: z.enum(["has_access", "no_access"]),
});
export type Lecturer = z.infer<typeof LecturerSchema>;

export const CreateLecturerInput = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  honorific: UserHonorificSchema.nullable().optional(),
  title: z.string().optional(),
  qualification: z.string().optional(),
  phone: z.string().optional(),
});
export type CreateLecturerInput = z.infer<typeof CreateLecturerInput>;

export const UpdateLecturerInput = CreateLecturerInput.partial();
export type UpdateLecturerInput = z.infer<typeof UpdateLecturerInput>;

/** Fields a signed-in lecturer may change on their own profile. */
export const UpdateMyLecturerProfileInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    honorific: UserHonorificSchema.nullable().optional(),
    title: z.string().trim().max(100).nullable(),
    qualification: z.string().trim().max(500).nullable(),
    phone: z.string().trim().max(50).nullable(),
    employmentType: z.string().trim().max(120).nullable(),
    fieldOfSpecialization: z.string().trim().max(500).nullable(),
    yearsOfExperience: z.number().int().min(0).max(80).nullable(),
  })
  .strict();
export type UpdateMyLecturerProfileInput = z.infer<typeof UpdateMyLecturerProfileInput>;

export const ListLecturersQuery = z.object({
  search: z.string().trim().optional(),
});
export type ListLecturersQuery = z.infer<typeof ListLecturersQuery>;
