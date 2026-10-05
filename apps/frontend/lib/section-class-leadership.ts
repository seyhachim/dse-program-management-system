import type {
  ClassResponsibilityRole,
  ClassResponsibilityView,
  OfferingView,
  StudentCohortSectionMemberView,
} from "@dse-pms/shared-types";

export function activeSectionMembers(
  members: StudentCohortSectionMemberView[],
  sectionId: string,
): StudentCohortSectionMemberView[] {
  return members.filter((member) => member.currentSectionMembership?.sectionId === sectionId);
}

export function eligibleOfferingsForSectionResponsibility(
  offerings: OfferingView[],
  sectionCode: string,
  studentId: string,
): OfferingView[] {
  const normalizedCode = sectionCode.trim().toUpperCase();
  return offerings.filter(
    (offering) =>
      offering.status !== "Completed" &&
      offering.sectionCode.toUpperCase() === normalizedCode &&
      offering.students.some((student) => student.id === studentId),
  );
}

export function responsibilityAssignmentBehavior(
  role: ClassResponsibilityRole,
): "replace" | "add" {
  return role === "ClassMonitor" ? "replace" : "add";
}

export type ResponsibilityAssignmentDecision =
  | "assign"
  | "already-assigned"
  | "blocked-by-other-role";

export function classifyResponsibilityAssignment(
  responsibilities: ClassResponsibilityView[],
  studentId: string,
  role: ClassResponsibilityRole,
): ResponsibilityAssignmentDecision {
  const existing = responsibilities.find((assignment) => assignment.student.id === studentId);
  if (!existing) return "assign";
  return existing.role === role ? "already-assigned" : "blocked-by-other-role";
}
