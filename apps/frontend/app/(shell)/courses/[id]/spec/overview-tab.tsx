"use client";

import { useParams } from "next/navigation";
import { ArrowRight, CheckCircle2, CircleAlert, Pencil } from "lucide-react";
import {
  FOCUS_LEVELS,
  teachingLearningIsReady,
  courseTypeLabel,
  semesterLabel,
  type CourseType,
  type Semester,
  type SpecSectionId,
  type SpecSectionStatus,
} from "@dse-pms/shared-types";
import { Button, CompletionRing } from "@dse-pms/ui";
import {
  EMPTY_TEACHING_LEARNING_PROFILE,
  teachingLearningApi,
} from "@/lib/teaching-learning";
import type { CourseInfoForm } from "./course-info-section";
import { focusCodeOf, focusPercentOf, type CloForm } from "./clo-model";
import type { WeeklyPlanForm } from "./weekly-plan-section";
import {
  instructionalWeeklyPlan,
  weekSltForm,
  weeklyPlanFormTotals,
} from "./weekly-plan-model";
import {
  assessmentTotalWeight,
  assessmentTypeChip,
  type AssessmentForm,
} from "./assessment-model";
import { deriveOverviewReadinessStatus } from "./overview-readiness";
import {
  OVERVIEW_REQUIRED_SECTIONS,
  type OverviewReadinessSectionId,
} from "./overview-sections";
import { ProgrammeSection } from "./programme-section";

export function OverviewTab({
  courseInfo,
  clos,
  weeklyPlan,
  assessments,
  status,
  courseTotalSlt,
  onEditCourseInfo,
  onGoToTab,
  readOnly = false,
}: {
  courseInfo: CourseInfoForm;
  clos: CloForm[];
  weeklyPlan: WeeklyPlanForm;
  assessments: AssessmentForm[];
  status: Record<string, SpecSectionStatus>;
  /** Course's total SLT hours, used to derive each CLO's Focus (F/M/P) from its share. */
  courseTotalSlt: number | null;
  onEditCourseInfo: () => void;
  onGoToTab: (id: SpecSectionId | "teachingLearning") => void;
  readOnly?: boolean;
}) {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const teachingLearningProfile =
    teachingLearningApi.getCached(courseId) ?? EMPTY_TEACHING_LEARNING_PROFILE;
  const instructionalPlan = instructionalWeeklyPlan(weeklyPlan);

  const activeClos = clos.filter((clo) => clo.status === "active");
  const cloReady =
    activeClos.length > 0 &&
    activeClos.every(
      (clo) => clo.description.trim().length > 0 && clo.mappedPlos.length > 0,
    );
  const teachingLearningReady = teachingLearningIsReady(
    teachingLearningProfile,
    clos,
  );
  const readinessStatus = deriveOverviewReadinessStatus(
    status,
    clos,
    instructionalPlan,
    assessments,
    { cloReady, teachingLearningReady },
  );
  const fillable = OVERVIEW_REQUIRED_SECTIONS;
  const completed = fillable.filter((s) => readinessStatus[s.id] === "complete").length;
  const inProgress = fillable.filter((s) => readinessStatus[s.id] === "draft").length;
  const missing = fillable.length - completed - inProgress;
  const percent = fillable.length
    ? Math.round((completed / fillable.length) * 100)
    : 0;
  const unfinished = fillable.filter((s) => readinessStatus[s.id] !== "complete");
  const nextSection = unfinished[0];
  const nextSectionTitle = nextSection
    ? sectionDisplayTitle(nextSection.id, nextSection.title)
    : null;

  const deliverables = instructionalPlan.filter((w) => w.assessment.trim());
  const planTotals = weeklyPlanFormTotals(instructionalPlan);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader
            title="Course Information"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={onEditCourseInfo}
                disabled={readOnly}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />{" "}
                {readOnly ? "Read-only" : "Edit"}
              </Button>
            }
          />
          {courseInfo.courseCode || courseInfo.courseTitle ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Course Code" value={courseInfo.courseCode} />
              <Field label="Course Title" value={courseInfo.courseTitle} />
              <Field label="Credits" value={courseInfo.credits} />
              <Field
                label="Course Type"
                value={
                  courseInfo.courseType
                    ? courseTypeLabel(courseInfo.courseType as CourseType)
                    : ""
                }
              />
              <Field
                label="Semester"
                value={
                  courseInfo.semester
                    ? semesterLabel(courseInfo.semester as Semester)
                    : ""
                }
              />
              <Field
                label="Programme Year"
                value={
                  courseInfo.programmeYear
                    ? `Year ${courseInfo.programmeYear}`
                    : ""
                }
              />
              <Field label="Pre-requisites" value={courseInfo.prerequisites} full />
              <Field label="Instructor" value={courseInfo.instructorName} />
              <Field label="Qualification" value={courseInfo.qualification} />
              <Field label="Email" value={courseInfo.email} />
              <Field label="Telephone" value={courseInfo.telephone} />
              <Field label="Co-Lecturer(s)" value={courseInfo.otherLecturers} full />
              <Field
                label="Course Description / Synopsis"
                value={courseInfo.description}
                full
              />
            </dl>
          ) : (
            <EmptyHint
              text="No course information yet."
              action={readOnly ? undefined : "Fill it in"}
              onClick={readOnly ? undefined : onEditCourseInfo}
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Course Learning Outcomes (CLOs)"
            action={
              <button
                type="button"
                onClick={() => onGoToTab("clos")}
                className="text-sm font-medium text-accent-foreground hover:underline"
              >
                View All
              </button>
            }
          />
          {clos.length === 0 ? (
            <EmptyHint
              text="No CLOs yet."
              action="+ Add CLO"
              onClick={() => onGoToTab("clos")}
            />
          ) : (
            <ul className="space-y-2">
              {clos.slice(0, 5).map((clo) => (
                <li key={clo.code} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 inline-flex min-w-12 shrink-0 items-center justify-center rounded-full bg-accent px-2.5 py-1 text-xs font-semibold leading-none text-accent-foreground">
                    {clo.code}
                  </span>
                  <span className="min-w-0 flex-1 leading-5 text-foreground">
                    {clo.description || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Weekly Plan"
            action={
              <button
                type="button"
                onClick={() => onGoToTab("slt")}
                className="text-sm font-medium text-accent-foreground hover:underline"
              >
                View All
              </button>
            }
          />
          {instructionalPlan.length === 0 ? (
            <EmptyHint
              text="No weeks planned yet."
              action="Go to Weekly Plan"
              onClick={() => onGoToTab("slt")}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Week</th>
                    <th className="py-1.5 pr-2 font-medium">Topic</th>
                    <th className="py-1.5 pr-2 font-medium">CLOs</th>
                    <th className="py-1.5 text-right font-medium">SLT</th>
                  </tr>
                </thead>
                <tbody>
                  {instructionalPlan.slice(0, 6).map((w, index) => (
                    <tr key={w.id} className="border-t border-border">
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {index + 1}
                      </td>
                      <td className="py-1.5 pr-2 text-foreground">
                        {w.topic || "Untitled"}
                      </td>
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {w.cloCodes.length ? w.cloCodes.join(", ") : "—"}
                      </td>
                      <td className="py-1.5 text-right text-foreground">
                        {weekSltForm(w)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border text-xs font-medium text-muted-foreground">
                    <td className="py-1.5 pr-2" colSpan={3}>
                      Total SLT ({instructionalPlan.length}{" "}
                      {instructionalPlan.length === 1 ? "week" : "weeks"})
                    </td>
                    <td className="py-1.5 text-right">{planTotals.slt} h</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Assessment"
            action={
              <button
                type="button"
                onClick={() => onGoToTab("assessmentPlan")}
                className="text-sm font-medium text-accent-foreground hover:underline"
              >
                View All
              </button>
            }
          />
          {assessments.length === 0 ? (
            <EmptyHint
              text="No assessments yet."
              action="Go to Assessment"
              onClick={() => onGoToTab("assessmentPlan")}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Assessment</th>
                    <th className="py-1.5 pr-2 font-medium">Type</th>
                    <th className="py-1.5 pr-2 font-medium">CLOs</th>
                    <th className="py-1.5 text-right font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.slice(0, 6).map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="py-1.5 pr-2 text-foreground">
                        {a.name || "Untitled"}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span
                          className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${assessmentTypeChip(a.type)}`}
                        >
                          {a.type}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {a.cloCodes.length ? a.cloCodes.join(", ") : "—"}
                      </td>
                      <td className="py-1.5 text-right text-foreground">
                        {a.weight === "" ? "—" : `${a.weight}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border text-xs font-medium text-muted-foreground">
                    <td className="py-1.5 pr-2" colSpan={3}>
                      Total ({assessments.length}{" "}
                      {assessments.length === 1 ? "assessment" : "assessments"})
                    </td>
                    <td className="py-1.5 text-right">
                      {Math.round(assessmentTotalWeight(assessments) * 100) / 100}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Deliverables"
            action={
              <button
                type="button"
                onClick={() => onGoToTab("slt")}
                className="text-sm font-medium text-accent-foreground hover:underline"
              >
                View All
              </button>
            }
          />
          {deliverables.length === 0 ? (
            <EmptyHint
              text="No deliverables yet."
              action="Go to Weekly Plan"
              onClick={() => onGoToTab("slt")}
            />
          ) : (
            <div className="space-y-1.5 text-sm">
              {deliverables.slice(0, 6).map((w) => (
                <div key={w.id} className="flex items-center justify-between">
                  <span className="text-foreground">{w.assessment}</span>
                  <span className="text-muted-foreground">
                    Week {instructionalPlan.findIndex((item) => item.id === w.id) + 1}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader
              title="Resources"
              action={
                <button
                  type="button"
                  onClick={() => onGoToTab("resources")}
                  className="text-sm font-medium text-accent-foreground hover:underline"
                >
                  View Resources
                </button>
              }
            />
            <SectionStatusList
              items={[
                { label: "Required Resources", status: readinessStatus.resources },
                { label: "References / Textbooks", status: readinessStatus.references },
              ]}
            />
          </Card>
          <Card>
            <CardHeader
              title="Policies & Responsibilities"
              action={
                <button
                  type="button"
                  onClick={() => onGoToTab("policy")}
                  className="text-sm font-medium text-accent-foreground hover:underline"
                >
                  View Policies
                </button>
              }
            />
            <SectionStatusList
              items={[
                { label: "Course Policy", status: readinessStatus.policy },
                {
                  label: "Student Responsibility",
                  status: readinessStatus.responsibility,
                },
              ]}
            />
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Specification Readiness" />
          <div className="flex items-center gap-4">
            <CompletionRing value={percent} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {completed} of {fillable.length} required sections ready
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {missing > 0
                  ? `${missing} not started and ${inProgress} in progress.`
                  : inProgress > 0
                    ? `${inProgress} section${inProgress === 1 ? "" : "s"} still in progress.`
                    : "All required sections are complete."}
              </p>
            </div>
          </div>

          {nextSection ? (
            <div className="mt-5 rounded-lg border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Recommended next step
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {nextSectionTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {readinessStatus[nextSection.id] === "draft"
                      ? "Continue this section and resolve the remaining attention items."
                      : "Add the required information to start this section."}
                  </p>
                  <button
                    type="button"
                    onClick={() => onGoToTab(nextSection.id)}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
                  >
                    {readinessStatus[nextSection.id] === "draft"
                      ? "Continue"
                      : "Start section"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-foreground">Ready for review</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  All required sections are complete. Review the document before submission.
                </p>
              </div>
            </div>
          )}

          {unfinished.length > 1 ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Also needs attention
              </p>
              <ul className="space-y-2">
                {unfinished.slice(1, 4).map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => onGoToTab(section.id)}
                      className="flex w-full items-center justify-between gap-3 text-left text-sm hover:text-accent-foreground"
                    >
                      <span className="truncate text-foreground">
                        {sectionDisplayTitle(section.id, section.title)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {readinessStatus[section.id] === "draft" ? "In progress" : "Not started"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {unfinished.length > 4 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  +{unfinished.length - 4} more section{unfinished.length - 4 === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Quick Actions" />
          <ul className="divide-y divide-border text-sm">
            <QuickAction label="CLOs & PLO Mapping" onClick={() => onGoToTab("clos")} />
            <QuickAction label="Assessment" onClick={() => onGoToTab("assessmentPlan")} />
            <QuickAction label="Weekly Plan" onClick={() => onGoToTab("slt")} />
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Mapping Preview"
            action={
              <button
                type="button"
                onClick={() => onGoToTab("clos")}
                className="text-sm font-medium text-accent-foreground hover:underline"
              >
                View Full Mapping
              </button>
            }
          />
          <p className="mb-2 text-xs text-muted-foreground">
            CLO → PLO (Focus: F / M / P)
          </p>
          {clos.length === 0 ? (
            <EmptyHint text="No CLOs yet." />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {clos.map((clo) => {
                const percent = focusPercentOf(clo.sltHours, courseTotalSlt);
                const focus = FOCUS_LEVELS.find(
                  (f) => f.code === focusCodeOf(percent),
                );
                return (
                  <li key={clo.code} className="flex items-center justify-between">
                    <span className="text-foreground">
                      {clo.code} →{" "}
                      {clo.mappedPlos.length ? clo.mappedPlos.join(", ") : "—"}
                    </span>
                    {focus ? (
                      <span className="rounded-full bg-status-live-bg px-2 py-0.5 text-xs font-medium text-status-live">
                        {focus.code}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Programme Reference (Part 1)" />
          <ProgrammeSection />
        </Card>
      </div>
    </div>
  );
}

function sectionDisplayTitle(
  id: OverviewReadinessSectionId,
  title: string,
): string {
  return id === "date" ? "Specification Date" : title;
}

function sectionStatusLabel(status: SpecSectionStatus | undefined): string {
  if (status === "complete") return "Complete";
  if (status === "draft") return "In progress";
  return "Not started";
}

function SectionStatusList({
  items,
}: {
  items: Array<{ label: string; status: SpecSectionStatus | undefined }>;
}) {
  return (
    <ul className="divide-y divide-border text-sm">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <span className="text-foreground">{item.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {sectionStatusLabel(item.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      {children}
    </section>
  );
}

function CardHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {action}
    </div>
  );
}

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-foreground">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

function EmptyHint({
  text,
  action,
  onClick,
}: {
  text: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
      <p>{text}</p>
      {action && onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="mt-1 font-medium text-accent-foreground hover:underline"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function QuickAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between py-2 text-left hover:text-accent-foreground"
      >
        <span className="text-foreground">{label}</span>
        <span className="text-accent-foreground">Open</span>
      </button>
    </li>
  );
}
