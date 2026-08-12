import { z } from "zod";

/**
 * Lecturers are Users with role = lecturer, surfaced via the Lecturers plugin.
 * Courses and Offerings consume this through registry.get('lecturers').
 *
 * title / qualification / phone populate the syllabus "Course Details" block
 * (§6–9) so an offering's syllabus can auto-fill instructor info.
 */
export const LecturerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  title: z.string().nullable().optional(),
  qualification: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});
export type Lecturer = z.infer<typeof LecturerSchema>;

export const CreateLecturerInput = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
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
    title: z.string().trim().max(100).nullable(),
    qualification: z.string().trim().max(500).nullable(),
    phone: z.string().trim().max(50).nullable(),
  })
  .strict();
export type UpdateMyLecturerProfileInput = z.infer<typeof UpdateMyLecturerProfileInput>;

export const ListLecturersQuery = z.object({
  search: z.string().trim().optional(),
});
export type ListLecturersQuery = z.infer<typeof ListLecturersQuery>;
