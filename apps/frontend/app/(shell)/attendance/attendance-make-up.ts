import type { ApprovedMakeUpAttendanceDate, OfferingView } from "@dse-pms/shared-types";
import { isAttendanceEligibleOffering, offeringsScheduledOnDate } from "./attendance-schedule";

/**
 * Preserve the regular timetable filter, adding only programme-approved
 * replacements for the exact selected date. Pending/rejected proposals do not
 * appear here. The server has already filtered approved rows by authorization.
 */
export function attendanceOfferingsOnDate(
  offerings: readonly OfferingView[],
  date: string,
  approved: readonly ApprovedMakeUpAttendanceDate[],
): OfferingView[] {
  const regular = offeringsScheduledOnDate(offerings, date);
  const seen = new Set(regular.map((item) => item.id));
  for (const makeUp of approved) {
    if (makeUp.replacementDate !== date || seen.has(makeUp.offeringId)) continue;
    const offering = offerings.find((candidate) =>
      candidate.id === makeUp.offeringId && isAttendanceEligibleOffering(candidate),
    );
    if (offering) {
      regular.push(offering);
      seen.add(offering.id);
    }
  }
  return regular;
}
