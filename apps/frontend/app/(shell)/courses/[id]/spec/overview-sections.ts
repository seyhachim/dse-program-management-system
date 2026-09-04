import {
  COURSE_SPEC_AUTHORING_SECTIONS,
  type CourseSpecAuthoringSection,
  type CourseSpecAuthoringSectionId,
} from "@dse-pms/shared-types";

export type OverviewReadinessSectionId = CourseSpecAuthoringSectionId;
export type OverviewReadinessSection = CourseSpecAuthoringSection;

/**
 * Shared canonical lecturer-work readiness list. Specification Date is automatic;
 * Teaching & Learning is required authoring work.
 */
export const OVERVIEW_REQUIRED_SECTIONS = COURSE_SPEC_AUTHORING_SECTIONS;
