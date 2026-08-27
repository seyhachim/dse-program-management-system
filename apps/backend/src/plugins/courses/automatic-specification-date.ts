export const PROGRAMME_TIME_ZONE = "Asia/Phnom_Penh";

export const MISSING_RESUBMISSION_SPECIFICATION_DATE_ERROR =
  "Course specification cannot be resubmitted because its original Specification Date is missing";

function dateOnlyInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function specificationDateForSubmission({
  reviewStatus,
  existingDate,
  now,
}: {
  reviewStatus: "Draft" | "ChangesRequested";
  existingDate: Date | null;
  now: Date;
}): Date {
  if (existingDate) return existingDate;

  if (reviewStatus === "ChangesRequested") {
    throw new Error(MISSING_RESUBMISSION_SPECIFICATION_DATE_ERROR);
  }

  const dateOnly = dateOnlyInTimeZone(now, PROGRAMME_TIME_ZONE);
  return new Date(`${dateOnly}T00:00:00.000Z`);
}
