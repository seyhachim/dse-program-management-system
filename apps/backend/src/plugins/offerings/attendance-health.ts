import type {
  AttendanceStatus,
  TelegramAttendanceAchievement,
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

function weekKey(date: string) {
  const current = new Date(`${date}T00:00:00.000Z`);
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() - day + 1);
  return current.toISOString().slice(0, 10);
}

function deriveAchievements(
  recordsNewestFirst: AttendanceHealthRecord[],
  onTimeStreak: number,
  state: TelegramAttendanceHealth["state"],
): TelegramAttendanceAchievement[] {
  const achievements: TelegramAttendanceAchievement[] = [];
  const latestWeek = recordsNewestFirst[0] ? weekKey(recordsNewestFirst[0].date) : null;
  const latestWeekRecords = latestWeek
    ? recordsNewestFirst.filter((record) => weekKey(record.date) === latestWeek)
    : [];

  if (latestWeekRecords.length >= 2 && latestWeekRecords.every((record) => record.status === "Present")) {
    achievements.push({
      kind: "perfect_week",
      title: "Perfect Week",
      description: `Present and on time for all ${latestWeekRecords.length} finalized classes in your latest attendance week.`,
      icon: "🏅",
    });
  }

  const marked = recordsNewestFirst.length;
  const attended = recordsNewestFirst.filter((record) => record.status === "Present" || record.status === "Late").length;
  const attendanceRate = marked === 0 ? 0 : (attended / marked) * 100;
  if (marked >= 5 && attendanceRate >= 90) {
    achievements.push({
      kind: "consistency",
      title: "Consistency",
      description: `${Math.round(attendanceRate)}% finalized attendance across ${marked} recorded classes.`,
      icon: "✨",
    });
  }

  if (onTimeStreak >= 5) {
    achievements.push({
      kind: "on_time",
      title: "On Time",
      description: `On time for your last ${onTimeStreak} finalized classes.`,
      icon: "⏰",
    });
  }

  if (state === "recovery") {
    achievements.push({
      kind: "comeback",
      title: "Comeback",
      description: "You rebuilt your punctuality with at least 3 on-time classes after an earlier late pattern.",
      icon: "🌱",
    });
  }

  return achievements;
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
  const newestFirst = [...records].sort((a, b) => b.date.localeCompare(a.date));

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
      title: consecutiveLate >= 5
        ? "Repeated lateness needs support"
        : level === "warning"
          ? "Punctuality needs attention"
          : "Punctuality reminder",
      message: consecutiveLate >= 5
        ? `You have been late to your last ${consecutiveLate} finalized classes. If a recurring transport, timetable, or personal issue is affecting you, please speak with your lecturer or adviser so they can help.`
        : `You have been late to your last ${consecutiveLate} finalized classes.`,
      advice: punctualityAdvice,
    });
    if (consecutiveLate === 3 && newestFirst[0]) {
      warningCandidates.push({ kind: "punctuality", count: consecutiveLate, eventSessionId: newestFirst[0].sessionId });
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
    if (absencePermissionCount === 3) {
      const latestContribution = newestFirst.find((record) => record.status === "Absent" || record.status === "Excused");
      if (latestContribution) {
        warningCandidates.push({ kind: "attendance", count: absencePermissionCount, eventSessionId: latestContribution.sessionId });
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

  const achievements = deriveAchievements(newestFirst, onTimeStreak, state);

  return {
    health: {
      state,
      attendanceStreak,
      onTimeStreak,
      consecutiveLate,
      absencePermissionCount,
      signals,
      achievements,
      message,
    },
    warningCandidates,
  };
}
