import type { CloForm } from "./clo-model";
import type { WeekForm } from "./weekly-plan-model";
import type { AssessmentForm } from "./assessment-model";

export type ConstructiveAlignmentStatus =
  | "fullyAligned"
  | "teachingOnly"
  | "assessmentOnly"
  | "notAligned";

export type CloAlignmentAudit = {
  code: string;
  description: string;
  status: ConstructiveAlignmentStatus;
  teachingWeeks: Array<{
    id: string;
    week: string;
    topic: string;
  }>;
  activeAssessments: Array<{
    id: string;
    name: string;
    weight: string;
  }>;
  inactiveAssessments: Array<{
    id: string;
    name: string;
  }>;
};

export type ConstructiveAlignmentAudit = {
  clos: CloAlignmentAudit[];
  activeCloCount: number;
  taughtCount: number;
  assessedCount: number;
  issueCount: number;
  allAligned: boolean;
  hasWeeklyPlan: boolean;
  hasAssessments: boolean;
  unmappedWeeks: Array<{ id: string; week: string; topic: string }>;
  unmappedActiveAssessments: Array<{ id: string; name: string }>;
};

export const ALIGNMENT_STATUS_LABELS: Record<ConstructiveAlignmentStatus, string> = {
  fullyAligned: "Fully aligned",
  teachingOnly: "Teaching only",
  assessmentOnly: "Assessment only",
  notAligned: "Not aligned",
};

export const ALIGNMENT_STATUS_PRIORITY: Record<ConstructiveAlignmentStatus, number> = {
  notAligned: 0,
  assessmentOnly: 1,
  teachingOnly: 2,
  fullyAligned: 3,
};

export function deriveConstructiveAlignmentAudit(
  clos: CloForm[],
  weeklyPlan: WeekForm[],
  assessments: AssessmentForm[],
): ConstructiveAlignmentAudit {
  const activeClos = clos.filter((clo) => clo.status === "active");
  const activeAssessments = assessments.filter((item) => item.status === "active");
  const inactiveAssessments = assessments.filter((item) => item.status === "inactive");

  const rows: CloAlignmentAudit[] = activeClos.map((clo) => {
    const teachingWeeks = weeklyPlan
      .filter((week) => week.cloCodes.includes(clo.code))
      .map((week) => ({ id: week.id, week: week.week, topic: week.topic }));
    const activeAssessmentEvidence = activeAssessments
      .filter((item) => item.cloCodes.includes(clo.code))
      .map((item) => ({ id: item.id, name: item.name, weight: item.weight }));
    const inactiveAssessmentEvidence = inactiveAssessments
      .filter((item) => item.cloCodes.includes(clo.code))
      .map((item) => ({ id: item.id, name: item.name }));

    const taught = teachingWeeks.length > 0;
    const assessed = activeAssessmentEvidence.length > 0;
    const status: ConstructiveAlignmentStatus = taught
      ? assessed
        ? "fullyAligned"
        : "teachingOnly"
      : assessed
        ? "assessmentOnly"
        : "notAligned";

    return {
      code: clo.code,
      description: clo.description,
      status,
      teachingWeeks,
      activeAssessments: activeAssessmentEvidence,
      inactiveAssessments: inactiveAssessmentEvidence,
    };
  });

  const taughtCount = rows.filter((row) => row.teachingWeeks.length > 0).length;
  const assessedCount = rows.filter((row) => row.activeAssessments.length > 0).length;
  const issueCount = rows.filter((row) => row.status !== "fullyAligned").length;

  return {
    clos: rows,
    activeCloCount: rows.length,
    taughtCount,
    assessedCount,
    issueCount,
    allAligned: rows.length > 0 && issueCount === 0,
    hasWeeklyPlan: weeklyPlan.length > 0,
    hasAssessments: assessments.length > 0,
    unmappedWeeks: weeklyPlan
      .filter((week) => week.cloCodes.length === 0)
      .map((week) => ({ id: week.id, week: week.week, topic: week.topic })),
    unmappedActiveAssessments: activeAssessments
      .filter((item) => item.cloCodes.length === 0)
      .map((item) => ({ id: item.id, name: item.name })),
  };
}

export function sortedAlignmentIssues(rows: CloAlignmentAudit[]): CloAlignmentAudit[] {
  return rows
    .filter((row) => row.status !== "fullyAligned")
    .sort(
      (a, b) =>
        ALIGNMENT_STATUS_PRIORITY[a.status] - ALIGNMENT_STATUS_PRIORITY[b.status] ||
        a.code.localeCompare(b.code),
    );
}
