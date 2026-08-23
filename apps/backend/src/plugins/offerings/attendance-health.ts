import type {
  AttendanceStatus,
  TelegramAttendanceHealth,
  TelegramAttendanceHealthSignal,
} from "@dse-pms/shared-types";

export type AttendanceHealthRecord = {
  sessionId: string;
  date: string;
  status: AttendanceStatus;
};

export type AttendanceWarningCandidate = {
  kind: "attendance" | "punctuality";
  count: number;
  eventSessionId: string;
};

function currentRun(recordsNewestFirst: AttendanceHealthRecord[], predicate: (status: AttendanceStatus) => boolean) {
  let count = 0;
  for (const record of recordsNewestFirst) {
    if (!predicate(record.status)) break;
    count += 1;
  }
  return count;
}

function hadPriorLateWarning(recordsNewestFirst: AttendanceHealthRecord[], currentOnTimeStreak: number) {
  const older = recordsNewestFirst.slice(currentOnTimeStreak);
  let run = 0;
  for (const record of older) {
    if (record.status === "Late") {
      run += 1;
      if (run >= 3) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

function attendanceAdvice(absent: number, excused: number) {
  const advice: string[] = [];
  if (absent > 0) {
    advice.push("Try to attend your next scheduled class.");
    advice.push("If something is affecting your attendance, contact your lecturer or programme team early.");
  }
  if (excused > 0) {
    advice.push("Review the topics, materials, and assessments from the classes you missed.");
    advice.push("Ask your lecturer for catch-up guidance if you need it.");
  }
  return advice;
}

const punctualityAdvice = [
  "Aim to arrive 10–15 minutes before class.",
  "Set a reminder before class and check the room and schedule in advance.",
  "Prepare your materials before leaving.",
  "If transport or timetable issues continue, speak with your lecturer or adviser.",
];

export function evaluateAttendanceHealth(
  records: AttendanceHealthRecord[],
  counts: { Absent: number; Excused: number },
): { health: TelegramAttendanceHealth; warningCandidates: AttendanceWarningCandidate[] } {
  const newestFirst = [...records]
    .filter((record) => record.status != null)
    .sort((a, b) => b.date.localeCompare(a.date));

  const attendanceStreak = currentRun(newestFirst, (status) => status === "Present" || status === "Late");
  const onTimeStreak = currentRun(newestFirst, (status) => status === "Present");
  const consecutiveLate = currentRun(newestFirst, (status) => status === "Late");
  const absencePermissionCount = counts.Absent + counts.Excused;
  const signals: TelegramAttendanceHealthSignal[] = [];
  const warningCandidates: AttendanceWarningCandidate[] = [];

  if (consecutiveLate >= 2) {
    const level = consecutiveLate >= 3 ? "warning" : "watch";
    signals.push({
      kind: "punctuality",
      level,
      count: consecutiveLate,
      title: level === "warning" ? "Punctuality needs attention" : "Punctuality reminder",
      message: `You have been late to your last ${consecutiveLate} finalized classes.`,
      advice: punctualityAdvice,
    });
    if (consecutiveLate >= 3 && newestFirst[0]) {
      warningCandidates.push({
        kind: "punctuality",
        count: consecutiveLate,
        eventSessionId: newestFirst[0].sessionId,
      });
    }
  }

  if (absencePermissionCount >= 2) {
    const level = absencePermissionCount >= 3 ? "warning" : "watch";
    signals.push({
      kind: "attendance",
      level,
      count: absencePermissionCount,
      title: level === "warning" ? "Attendance needs attention" : "Attendance reminder",
      message: `${counts.Absent} absent · ${counts.Excused} permission / excused.`,
      advice: attendanceAdvice(counts.Absent, counts.Excused),
    });
    if (absencePermissionCount >= 3) {
      const latestContribution = newestFirst.find(
        (record) => record.status === "Absent" || record.status === "Excused",
      );
      if (latestContribution) {
        warningCandidates.push({
          kind: "attendance",
          count: absencePermissionCount,
          eventSessionId: latestContribution.sessionId,
        });
      }
    }
  }

  const hasWarning = signals.some((signal) => signal.level === "warning");
  const hasWatch = signals.some((signal) => signal.level === "watch");
  const recovered = !hasWarning && !hasWatch && onTimeStreak >= 3 && hadPriorLateWarning(newestFirst, onTimeStreak);
  const state: TelegramAttendanceHealth["state"] = hasWarning
    ? "warning"
    : hasWatch
      ? "watch"
      : recovered
        ? "recovery"
        : "healthy";

  const message = state === "warning"
    ? "Your current attendance pattern needs attention. Small steps now can help you stay on track."
    : state === "watch"
      ? "A small change can help you stay on track."
      : state === "recovery"
        ? `Nice improvement — you have arrived on time for your last ${onTimeStreak} finalized classes.`
        : attendanceStreak >= 3
          ? `Great consistency — you have attended your last ${attendanceStreak} finalized classes.`
          : "Keep building a consistent attendance routine.";

  return {
    health: {
      state,
      attendanceStreak,
      onTimeStreak,
      consecutiveLate,
      absencePermissionCount,
      signals,
      message,
    },
    warningCandidates,
  };
}
