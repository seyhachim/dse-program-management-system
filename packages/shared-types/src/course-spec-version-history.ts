import { z } from "zod";
import { SpecSectionIdSchema } from "./course-spec.ts";

export const CourseSpecAcademicReviewStatusSchema = z.enum([
  "Draft",
  "Submitted",
  "UnderReview",
  "ChangesRequested",
  "Resubmitted",
  "Approved",
]);
export type CourseSpecAcademicReviewStatus = z.infer<
  typeof CourseSpecAcademicReviewStatusSchema
>;

export const CourseSpecAcademicRevisionTypeSchema = z.enum([
  "Initial",
  "Minor",
  "Major",
]);
export type CourseSpecAcademicRevisionType = z.infer<
  typeof CourseSpecAcademicRevisionTypeSchema
>;

export type CourseSpecVersionHistoryItem = {
  id: string;
  courseId: string;
  versionMajor: number;
  versionMinor: number;
  academicVersion: string;
  revisionType: CourseSpecAcademicRevisionType;
  revisionReason: string;
  changeSummary: string;
  basedOnVersionId: string | null;
  reviewStatus: CourseSpecAcademicReviewStatus;
  submissionVersion: number;
  approvedAt: string | null;
  effectiveFrom: string | null;
  storedNextReviewDueAt: string | null;
  effectiveNextReviewDueAt: string | null;
  latestPeriodicReviewOutcome:
    | "Reaffirmed"
    | "MinorRevision"
    | "MajorRevision"
    | null;
  isCurrent: boolean;
  editable: boolean;
};

export type CourseSpecVersionHistoryView = {
  courseId: string;
  currentVersionId: string | null;
  versions: CourseSpecVersionHistoryItem[];
};

export type CourseSpecSectionComparison = {
  sectionId: z.infer<typeof SpecSectionIdSchema>;
  label: string;
  changed: boolean;
};

export type CourseSpecVersionComparisonView = {
  courseId: string;
  fromVersion: Pick<
    CourseSpecVersionHistoryItem,
    "id" | "academicVersion" | "reviewStatus" | "submissionVersion"
  >;
  toVersion: Pick<
    CourseSpecVersionHistoryItem,
    "id" | "academicVersion" | "reviewStatus" | "submissionVersion"
  >;
  changedSectionCount: number;
  sections: CourseSpecSectionComparison[];
};
