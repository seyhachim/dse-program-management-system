import {
  COMPLETABLE_SPEC_SECTIONS,
  type SpecSectionId,
} from "@dse-pms/shared-types";

export type OverviewReadinessSectionId = SpecSectionId | "teachingLearning";

export type OverviewReadinessSection = {
  id: OverviewReadinessSectionId;
  title: string;
};

/**
 * Lecturer-work readiness differs slightly from raw persisted CourseSpec
 * sections: Specification Date is assigned by the PMS on first submission,
 * while Teaching & Learning is real required authoring work stored through its
 * dedicated profile API.
 */
export const OVERVIEW_REQUIRED_SECTIONS: readonly OverviewReadinessSection[] =
  COMPLETABLE_SPEC_SECTIONS.flatMap((section) => {
    if (section.id === "date") return [];
    if (section.id === "clos") {
      return [
        section,
        { id: "teachingLearning", title: "Teaching & Learning" },
      ];
    }
    return [section];
  });
