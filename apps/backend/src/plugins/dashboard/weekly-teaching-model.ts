import type {
  WeeklyTeachingSession,
  WeeklyTeachingStatus,
  WeeklyTeachingSummary,
} from "@dse-pms/shared-types";

/** Monitor data is evidence, not a disciplinary or absence finding. */
export interface WeeklyTeachingEvidence {
  classOccurred: boolean | null;
  coverage: WeeklyTeachingSession["coverage"];
  explicitSessionStatus: string | null;
  officialHoliday: boolean;
  approvedLeave: boolean;
  ended: boolean;
}

export function deriveWeeklyTeachingStatus(e: WeeklyTeachingEvidence): WeeklyTeachingStatus {
  // Actual positive delivery evidence prevails over conflicting planned exceptions,
  // which remain visible as separate metadata for authorised review.
  if (e.classOccurred === true) {
    return e.coverage === "TAUGHT_AS_PLANNED" ? "held_as_planned" : "held_with_changes";
  }
  if (e.explicitSessionStatus === "Holiday" || e.officialHoliday) return "holiday";
  if (e.explicitSessionStatus === "Cancelled") return "cancelled";
  if (e.explicitSessionStatus === "Rescheduled") return "rescheduled";
  if (e.approvedLeave) return "approved_leave";
  if (e.classOccurred === false) return "not_held";
  return e.ended ? "missing_evidence" : "upcoming";
}

/**
 * Accounting is deliberately descriptive: reviewMinutes is NOT a certified
 * make-up/recovery debt. That requires linked recovery and verification (#936).
 */
export function summarizeWeeklyTeaching(
  sessions: readonly WeeklyTeachingSession[],
): WeeklyTeachingSummary {
  const sum: WeeklyTeachingSummary = {
    scheduledSessions: 0, deliveredSessions: 0,
    scheduledMinutes: 0, deliveredMinutes: 0,
    heldAsPlanned: 0, heldWithChanges: 0,
    cancelled: 0, notHeld: 0, approvedLeave: 0, rescheduled: 0,
    holidays: 0, missingEvidence: 0, upcoming: 0, reviewMinutes: 0,
  };
  for (const session of sessions) {
    const status = session.status;
    if (status === "holiday") {
      sum.holidays += 1;
      continue;
    }
    sum.scheduledSessions += 1;
    sum.scheduledMinutes += session.scheduledMinutes;
    if (status === "held_as_planned" || status === "held_with_changes") {
      sum.deliveredSessions += 1;
      sum.deliveredMinutes += session.deliveredMinutes;
      if (status === "held_as_planned") sum.heldAsPlanned += 1;
      else sum.heldWithChanges += 1;
    } else if (status === "upcoming") {
      sum.upcoming += 1;
    } else {
      sum.reviewMinutes += session.scheduledMinutes;
      if (status === "cancelled") sum.cancelled += 1;
      if (status === "not_held") sum.notHeld += 1;
      if (status === "approved_leave") sum.approvedLeave += 1;
      if (status === "rescheduled") sum.rescheduled += 1;
      if (status === "missing_evidence") sum.missingEvidence += 1;
    }
  }
  return sum;
}
