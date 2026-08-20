export const SPECIFICATION_DATE_REQUIRED_ERROR =
  "Course specification is incomplete: Specification Date is required before submission";

export function hasSpecificationDate(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSpecificationDateReady(
  status: unknown,
  value: unknown,
): boolean {
  return status === "complete" && hasSpecificationDate(value);
}
