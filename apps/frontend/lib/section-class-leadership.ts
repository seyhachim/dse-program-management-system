import type { OfferingView, StudentCohortSectionMemberView } from "@dse-pms/shared-types";

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
      offering.status === "Active" &&
      offering.sectionCode.toUpperCase() === normalizedCode &&
      offering.students.some((student) => student.id === studentId),
  );
}
