import { z } from "zod";
import { CreateOfferingInput, UpdateOfferingInput, type Semester } from "./offerings.ts";

export const OfferingCurriculumVersionStatusSchema = z.enum([
  "Approved",
  "Active",
  "Superseded",
]);
export type OfferingCurriculumVersionStatus = z.infer<typeof OfferingCurriculumVersionStatusSchema>;

export interface OfferingCurriculumVersionRef {
  id: string;
  curriculumId: string;
  curriculumCode: string;
  curriculumName: string;
  versionMajor: number;
  versionMinor: number;
  version: string;
  status: OfferingCurriculumVersionStatus;
  cohortLabel: string;
  intakeYear: number | null;
  academicYear: string;
}

export interface OfferingCurriculumPlacementRef {
  id: string;
  curriculumVersionId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  yearLevel: number;
  semester: Semester;
  creditsSnapshot: number;
  courseTypeSnapshot: string;
  pathwayId: string | null;
  courseSpecVersionId: string | null;
}

export interface OfferingCurriculumBindingView {
  offeringId: string;
  curriculumCourseId: string;
  curriculumVersionId: string;
  version: OfferingCurriculumVersionRef;
  placement: OfferingCurriculumPlacementRef;
  boundByUserId: string;
  boundAt: string;
  updatedByUserId: string;
  updatedAt: string;
}

export const OfferingCurriculumVersionsQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});
export type OfferingCurriculumVersionsQuery = z.infer<typeof OfferingCurriculumVersionsQuerySchema>;

export const OfferingCurriculumPlacementsQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  curriculumVersionId: z.string().uuid(),
  studyYear: z.coerce.number().int().min(1).max(4),
  semester: z.enum(["First", "Second"]),
});
export type OfferingCurriculumPlacementsQuery = z.infer<typeof OfferingCurriculumPlacementsQuerySchema>;

export const CreateCurriculumBoundOfferingInputSchema = z.object({
  curriculumCourseId: z.string().uuid(),
  offering: CreateOfferingInput,
});
export type CreateCurriculumBoundOfferingInput = z.infer<typeof CreateCurriculumBoundOfferingInputSchema>;

export const UpdateCurriculumBoundOfferingInputSchema = z.object({
  offering: UpdateOfferingInput,
});
export type UpdateCurriculumBoundOfferingInput = z.infer<typeof UpdateCurriculumBoundOfferingInputSchema>;

export interface OfferingCurriculumServiceContract {
  listVersions(programmeId: string): Promise<OfferingCurriculumVersionRef[]>;
  listPlacements(
    programmeId: string,
    curriculumVersionId: string,
    studyYear: number,
    semester: Semester,
  ): Promise<OfferingCurriculumPlacementRef[]>;
  getPlacement(
    programmeId: string,
    curriculumCourseId: string,
  ): Promise<OfferingCurriculumPlacementRef | null>;
  getVersion(
    programmeId: string,
    curriculumVersionId: string,
  ): Promise<OfferingCurriculumVersionRef | null>;
}
