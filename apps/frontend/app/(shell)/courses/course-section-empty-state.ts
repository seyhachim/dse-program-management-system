export type CourseSectionEmptyPresentation = {
  title: string;
  detail: string;
  groupLabel: string;
};

/**
 * Empty-section copy for the lecturer Course Specifications table.
 *
 * `hasSections === false` is the only state allowed to claim that no section
 * exists. Missing metadata fails safe to the assignment wording instead.
 */
export function courseSectionEmptyPresentation(
  assignedSectionCount: number,
  hasSections: boolean | undefined,
): CourseSectionEmptyPresentation | null {
  if (assignedSectionCount > 0) return null;

  if (hasSections === false) {
    return {
      title: "No section yet",
      detail: "Course Spec preparation only",
      groupLabel: "Course Spec preparation",
    };
  }

  if (hasSections === true) {
    return {
      title: "No section assigned to you",
      detail: "Existing sections are assigned to other lecturers",
      groupLabel: "Responsible Course Specs",
    };
  }

  return {
    title: "No section assigned to you",
    detail: "Section availability could not be confirmed",
    groupLabel: "Responsible Course Specs",
  };
}
