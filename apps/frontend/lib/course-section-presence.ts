import type { CourseSectionPresence } from "@dse-pms/shared-types";

/**
 * Section-presence metadata is supplementary. A transient/rolling-deployment
 * failure must not hide the primary Course Specifications data; an empty result
 * makes the UI fall back to conservative assignment wording instead.
 */
export async function optionalCourseSectionPresence(
  request: Promise<CourseSectionPresence[]>,
): Promise<CourseSectionPresence[]> {
  try {
    return await request;
  } catch {
    return [];
  }
}
