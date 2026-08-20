import type { SpecSectionStatus } from "@dse-pms/shared-types";

export const SPECIFICATION_DATE_SUBMISSION_ERROR =
  "Specification Date is required before submission. Enter the official date shown on this Course Specification document, save it, then submit again.";

export function hasSpecificationDate(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSpecificationDateReady(
  status: SpecSectionStatus | undefined,
  value: string | null | undefined,
): boolean {
  return status === "complete" && hasSpecificationDate(value);
}
