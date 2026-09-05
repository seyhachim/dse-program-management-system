import type { StudentStatus } from "./students.ts";
import type { UserHonorific } from "./lecturers.ts";

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
  email: string | null;
  status: StudentStatus;
}

export interface CourseRef {
  id: string;
  code: string;
  title: string;
  lecturerId: string | null;
  programmeId: string;
}

export interface CourseSpecVersionRef {
  id: string;
  courseId: string;
  versionMajor: number;
  versionMinor: number;
  version: string;
  reviewStatus: string;
  approvedAt: string | null;
  effectiveFrom: string | null;
  /** Exact version-scoped academic Course Team, when the read projection provides it. */
  courseTeam?: import("./courses.ts").CourseSpecTeamSummary;
}

/** Lean CourseSpec progress shape used by cross-plugin read projections. */
export interface CourseSpecProgressRef {
  courseId: string;
  code: string;
  title: string;
  completed: number;
  total: number;
  curriculumPlacement?: {
    programmeYear: number;
    semester: "First" | "Second";
    sortOrder: number;
  } | null;
}

export interface LecturerRef {
  id: string;
  name: string;
  email: string;
  honorific: UserHonorific | null;
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
  getCourseSpecVersion(id: string): Promise<CourseSpecVersionRef | null>;
  listApprovedSpecVersions(courseId: string): Promise<CourseSpecVersionRef[]>;
  weeklyContactHours(courseSpecId: string): Promise<CourseWeeklyContactHoursRef[]>;
  /** Narrow read used by the Dashboard without exposing CourseSpec content. */
  listSpecProgress(lecturerScope?: string): Promise<CourseSpecProgressRef[]>;
}

export interface CourseWeeklyContactHoursRef {
  week: number;
  lectureHours: number;
  tutorialHours: number;
  practiceHours: number;
  otherHours: number;
  totalContactHours: number;
}

export interface LecturersServiceContract {
  list(): Promise<LecturerRef[]>;
  getById(id: string): Promise<LecturerRef | null>;
}

/** Lean authoritative teaching evidence surfaced from the Offerings plugin. */
export interface LecturerTeachingEvidenceRef {
  offeringId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  sectionCode: string;
  status: "Planned" | "Active" | "Completed";
  role: "Primary Lecturer" | "Co-Lecturer";
}

export interface OfferingsServiceContract {
  courseIdsForLecturer(lecturerId: string): Promise<string[]>;
  courseIdsWithOfferings(courseIds: readonly string[]): Promise<string[]>;
  /** Read-only evidence projection; never creates a portfolio-owned teaching copy. */
  portfolioTeachingForLecturer(lecturerId: string): Promise<LecturerTeachingEvidenceRef[]>;
}

export interface AuthServiceContract {
  deleteAccountForUser(authId: string | null): Promise<void>;
}
