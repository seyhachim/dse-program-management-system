import type { SpecSectionStatus } from "@dse-pms/shared-types";

export type ReviewReadinessItemId =
  | "courseInfo"
  | "clos"
  | "teachingLearning"
  | "assessmentPlan"
  | "slt"
  | "date"
  | "mapping";

export type ReviewReadinessItem = {
  id: ReviewReadinessItemId;
  title: string;
  complete: boolean;
};

export function buildReviewReadinessItems({
  status,
  cloReady,
  teachingLearningReady,
  specificationDateReady,
  constructiveAlignmentReady,
}: {
  status: Record<string, SpecSectionStatus>;
  cloReady: boolean;
  teachingLearningReady: boolean;
  specificationDateReady: boolean;
  constructiveAlignmentReady: boolean;
}): ReviewReadinessItem[] {
  return [
    {
      id: "courseInfo",
      title: "Course Information",
      complete: status.courseInfo === "complete",
    },
    {
      id: "clos",
      title: "Course Learning Outcomes",
      complete: cloReady,
    },
    {
      id: "teachingLearning",
      title: "Teaching & Learning",
      complete: teachingLearningReady,
    },
    {
      id: "assessmentPlan",
      title: "Assessment",
      complete: status.assessmentPlan === "complete",
    },
    {
      id: "slt",
      title: "Weekly Plan",
      complete: status.slt === "complete",
    },
    {
      id: "date",
      title: "Specification Date",
      complete: specificationDateReady,
    },
    {
      id: "mapping",
      title: "Constructive Alignment",
      complete: constructiveAlignmentReady,
    },
  ];
}
