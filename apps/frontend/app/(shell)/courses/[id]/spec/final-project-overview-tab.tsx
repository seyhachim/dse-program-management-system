"use client";

import {
  COURSE_SPEC_AUTHORING_SECTIONS,
  type SpecSectionStatus,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import type { AssessmentForm } from "./assessment-model";
import type { CloForm } from "./clo-model";
import type { CourseInfoForm } from "./course-info-section";
import { deriveOverviewReadinessStatus } from "./overview-readiness";
import type { WeeklyPlanForm } from "./weekly-plan-model";

const PROJECT_SECTION_LABELS: Record<string, string> = {
  courseInfo: "Final Project Information",
  clos: "Course Learning Outcomes",
  teachingLearning: "Supervision & Learning",
  assessmentPlan: "Assessment",
  slt: "Milestone Plan",
  mapping: "Constructive Alignment",
  resources: "Project Resources",
  references: "References",
  policy: "Project Policies",
  responsibility: "Student Responsibilities",
};

function display(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === "") return "—";
  return String(value);
}

function statusLabel(status: SpecSectionStatus | undefined): string {
  return status === "complete" ? "Ready" : status === "draft" ? "In progress" : "Not started";
}

function SummaryCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{display(value as string | number | null | undefined)}</p>
    </div>
  );
}

export function FinalProjectOverviewTab({
  courseInfo,
  clos,
  weeklyPlan,
  assessments,
  status,
  teachingLearningReady,
  onEditCourseInfo,
  onGoToTab,
  readOnly = false,
}: {
  courseInfo: CourseInfoForm;
  clos: CloForm[];
  weeklyPlan: WeeklyPlanForm;
  assessments: AssessmentForm[];
  status: Record<string, SpecSectionStatus>;
  teachingLearningReady: boolean;
  onEditCourseInfo: () => void;
  onGoToTab: (id: string) => void;
  readOnly?: boolean;
}) {
  const effective = deriveOverviewReadinessStatus(
    status,
    clos,
    weeklyPlan,
    assessments,
    { teachingLearningReady },
  );
  const sections = COURSE_SPEC_AUTHORING_SECTIONS.map((section) => ({
    ...section,
    title: PROJECT_SECTION_LABELS[section.id] ?? section.title,
    status: effective[section.id],
  }));
  const completed = sections.filter((section) => section.status === "complete").length;
  const percentage = sections.length > 0 ? Math.round((completed / sections.length) * 100) : 0;
  const next = sections.find((section) => section.status !== "complete");
  const activeClos = clos.filter((clo) => clo.status === "active");
  const activeAssessments = assessments.filter((item) => item.status === "active");
  const totalWeight = activeAssessments.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <SummaryCard
          title="Final Project Information"
          action={
            !readOnly ? (
              <Button size="sm" variant="outline" onClick={onEditCourseInfo}>
                Edit synopsis
              </Button>
            ) : undefined
          }
        >
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Field label="Course Code" value={courseInfo.courseCode} />
            <Field label="Course Title" value={courseInfo.courseTitle} />
            <Field label="Credits" value={courseInfo.credits} />
            <Field label="Course Type" value={courseInfo.courseType} />
            <Field label="Semester" value={courseInfo.semester} />
            <Field label="Programme Year" value={courseInfo.programmeYear} />
          </div>
          <div className="mt-5 rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Delivery model
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              Supervised independent Final Project — no normal lecture syllabus
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The Course Specification defines the shared academic framework. Individual project supervisor assignments remain separate project records.
            </p>
          </div>
        </SummaryCard>

        <div className="grid gap-4 md:grid-cols-2">
          <SummaryCard
            title="Course Learning Outcomes"
            action={
              <Button size="sm" variant="ghost" onClick={() => onGoToTab("clos")}>
                Open
              </Button>
            }
          >
            <p className="text-2xl font-bold text-foreground">{activeClos.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">active CLOs</p>
            {activeClos.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {activeClos.slice(0, 3).map((clo) => (
                  <li key={clo.id} className="line-clamp-2">
                    <span className="font-semibold text-foreground">{clo.code}:</span>{" "}
                    {clo.description || "No description yet"}
                  </li>
                ))}
              </ul>
            ) : null}
          </SummaryCard>

          <SummaryCard
            title="Milestone Plan"
            action={
              <Button size="sm" variant="ghost" onClick={() => onGoToTab("slt")}>
                Open
              </Button>
            }
          >
            <p className="text-2xl font-bold text-foreground">{weeklyPlan.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">planned project weeks / checkpoints</p>
            <div className="mt-3 space-y-1.5">
              {weeklyPlan.slice(0, 4).map((week) => (
                <div key={week.id} className="flex gap-2 text-sm">
                  <span className="w-8 shrink-0 font-medium text-foreground">W{week.week}</span>
                  <span className="truncate text-muted-foreground">{week.topic || "Milestone not named"}</span>
                </div>
              ))}
            </div>
          </SummaryCard>

          <SummaryCard
            title="Supervision & Learning"
            action={
              <Button size="sm" variant="ghost" onClick={() => onGoToTab("teachingLearning")}>
                Open
              </Button>
            }
          >
            <p className="text-sm font-semibold text-foreground">
              {teachingLearningReady ? "Supervision framework ready" : "Needs attention"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Covers supervision approach, independent project work, support resources, and CLO learning-method coverage.
            </p>
          </SummaryCard>

          <SummaryCard
            title="Assessment"
            action={
              <Button size="sm" variant="ghost" onClick={() => onGoToTab("assessmentPlan")}>
                Open
              </Button>
            }
          >
            <p className="text-2xl font-bold text-foreground">{activeAssessments.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              active assessment components · {totalWeight}% total weight
            </p>
          </SummaryCard>
        </div>
      </div>

      <aside className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Specification Readiness</h2>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-[10px] border-muted text-2xl font-bold text-foreground">
              {percentage}%
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {completed} of {sections.length} required sections ready
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Readiness rules are unchanged; only Final Project vocabulary is adapted.
              </p>
            </div>
          </div>

          {next ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Recommended next step
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">{next.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Complete the academic requirements for this project-based section.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 px-0"
                onClick={() => onGoToTab(next.id)}
              >
                Open section →
              </Button>
            </div>
          ) : null}

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Section status
            </p>
            <div className="mt-3 space-y-2.5">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onGoToTab(section.id)}
                  className="flex w-full items-center justify-between gap-3 text-left text-sm"
                >
                  <span className="text-foreground">{section.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {statusLabel(section.status)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
