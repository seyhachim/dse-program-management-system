import type { StudentStatus } from "./students.ts";

/**
 * Cross-plugin service contracts. A plugin that needs another plugin's data
 * depends only on these interfaces — resolved at runtime via
 * `registry.get<Contract>(id).service` — never on the other plugin's internals.
 * This keeps plugins decoupled while staying fully type-safe.
 *
 * The `*Ref` shapes are intentionally lean (just the fields consumers need), so
 * a plugin's concrete Prisma-backed service is structurally assignable to its
 * contract without leaking createdAt/Date details across the boundary.
 */

export interface StudentRef {
  id: string;
  name: string;
  studentId: string;
  email: string;
  status: StudentStatus;
}

export interface CourseRef {
  id: string;
  code: string;
  title: string;
  lecturerId: string | null;
}

export interface LecturerRef {
  id: string;
  name: string;
  email: string;
  // Syllabus "Course Details" instructor block (§7 qualification, §9 phone).
  title: string | null;
  qualification: string | null;
  phone: string | null;
}

export interface StudentsServiceContract {
  getById(id: string): Promise<StudentRef | null>;
  findByIds(ids: string[]): Promise<StudentRef[]>;
}

export interface CoursesServiceContract {
  getById(id: string): Promise<CourseRef | null>;
}

export interface LecturersServiceContract {
  list(): Promise<LecturerRef[]>;
  getById(id: string): Promise<LecturerRef | null>;
}

export interface OfferingsServiceContract {
  /**
   * Distinct course ids for which the given lecturer teaches at least one
   * offering. Courses uses this (via the registry) so a lecturer who teaches an
   * offering of a course can see/open that course, even if they don't own it.
   */
  courseIdsForLecturer(lecturerId: string): Promise<string[]>;
}

export interface AuthServiceContract {
  /**
   * Remove the Supabase Auth identity linked to a User, so deleting an app row
   * (e.g. a lecturer) doesn't leave an orphaned login behind — a `null` authId
   * (dev-created rows that never went through account provisioning) is a no-op.
   */
  deleteAccountForUser(authId: string | null): Promise<void>;
}
