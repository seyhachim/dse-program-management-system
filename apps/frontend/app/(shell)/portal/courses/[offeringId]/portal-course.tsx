"use client";

import { useCallback, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ExternalLink,
  FileCheck2,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import type {
  CourseFeedbackInput,
  PortalCourseDetail,
} from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dse-pms/ui";
import {
  assessmentDeadline,
  meetingLabel,
  studentPortalApi,
} from "@/lib/student-portal";
import { PortalError, PortalLoading, usePortalData } from "../../portal-state";
import { PortalCourseAttendance } from "./portal-course-attendance";
import { PortalCourseWeeklyNotes } from "./portal-course-weekly-notes";

export function PortalCourse({ offeringId }: { offeringId: string }) {
  const load = useCallback(
    () => studentPortalApi.course(offeringId),
    [offeringId],
  );
  const { data, loading, error, setData } = usePortalData(load);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load course"} />;
  }

  const publishedResults = data.assessments.filter((item) => item.result);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {data.code}
              </span>
              <span className="rounded-lg bg-muted px-3 py-1 text-xs">
                Class {data.sectionCode}
              </span>
              <span className="rounded-lg bg-muted px-3 py-1 text-xs">
                {data.term}
              </span>
            </div>
            <h2 className="mt-3 break-words text-2xl font-bold">{data.title}</h2>
          </div>
          <Button
            variant="outline"
            onClick={() => setFeedbackOpen(true)}
            disabled={data.feedbackSubmitted}
          >
            <MessageSquareText />
            {data.feedbackSubmitted ? "Feedback submitted" : "Course feedback"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info
            icon={UserRound}
            label="Lecturer"
            value={data.lecturer?.name ?? "TBA"}
          />
          <Info
            icon={CalendarDays}
            label="Schedule"
            value={data.meetings[0] ? meetingLabel(data.meetings[0]) : "TBA"}
          />
          <Info
            icon={BookOpen}
            label="Credits"
            value={data.credits ? `${data.credits} credits` : "TBA"}
          />
        </div>
      </section>

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full justify-start overflow-x-auto whitespace-nowrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="weekly-notes">Weekly Notes</TabsTrigger>
          <TabsTrigger value="learning">Learning</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-3">
          <Card title="Course description" compact>
            <p className="break-words text-sm leading-6 text-muted-foreground">
              {data.description || "Course description is not available yet."}
            </p>
          </Card>

          <Card title="Class schedule" compact>
            {data.meetings.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.meetings.map((meeting) => (
                  <div key={meeting.id} className="rounded-xl bg-muted/50 p-3">
                    <p className="text-sm font-medium">{meeting.activityType}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {meetingLabel(meeting)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {meeting.room || "Room TBA"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <Muted>No schedule has been published yet.</Muted>
            )}
          </Card>

          <Card title="Teaching team" compact>
            <p className="text-sm font-medium">
              {data.lecturer?.name ?? "Primary lecturer TBA"}
            </p>
            {data.lecturer?.email ? (
              <p className="text-xs text-muted-foreground">{data.lecturer.email}</p>
            ) : null}
            {data.coLecturers.length ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Co-lecturers: {data.coLecturers.map((item) => item.name).join(", ")}
              </p>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-3">
          <PortalCourseAttendance offeringId={offeringId} />
        </TabsContent>

        <TabsContent value="weekly-notes" className="mt-3">
          <PortalCourseWeeklyNotes offeringId={offeringId} />
        </TabsContent>

        <TabsContent value="learning" className="mt-3 space-y-3">
          {data.specAvailable && data.weeks.length ? (
            <Card title="Weekly topics" compact>
              <div className="space-y-2">
                {data.weeks.map((week) => (
                  <div
                    key={week.id}
                    className="flex gap-3 rounded-xl bg-muted/40 p-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {week.week}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {week.topic || "Topic to be announced"}
                      </p>
                      {week.learningOutcomes.length ? (
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">
                          {week.learningOutcomes.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <AvailabilityCard
              title="Learning content"
              message="Learning details will appear here when published course information is available."
            />
          )}
        </TabsContent>

        <TabsContent value="assessments" className="mt-3">
          {data.assessments.length ? (
            <Card title="Assessment plan" compact>
              <div className="space-y-2.5">
                {data.assessments.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border p-3"
                  >
                    <div className="flex flex-col justify-between gap-2 sm:flex-row">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span className="text-[11px] font-semibold uppercase text-primary">
                            {item.type}
                          </span>
                          <span className="text-[11px] capitalize text-muted-foreground">
                            {item.mode}
                          </span>
                        </div>
                        <h4 className="mt-1 text-sm font-semibold">{item.name}</h4>
                      </div>
                      <div className="text-xs sm:text-right">
                        <p className="font-semibold">
                          {item.weight === null ? "Weight TBA" : `${item.weight}%`}
                        </p>
                        <p className="text-muted-foreground">
                          {assessmentDeadline(item.dueAt, item.dueWeek)}
                        </p>
                      </div>
                    </div>
                    {item.description ? (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                    {item.instructions ? (
                      <div className="mt-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                        <span className="font-medium">Instructions:</span>{" "}
                        {item.instructions}
                      </div>
                    ) : null}
                    <AssessmentRubric assessment={item} />
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <AvailabilityCard
              title="Assessments"
              message="Assessment details are not available yet. They will appear here when they are published."
            />
          )}
        </TabsContent>

        <TabsContent value="grades" className="mt-3 space-y-3">
          {publishedResults.length ? (
            <>
              {data.courseGradeComplete && data.totalCourseGrade !== null ? (
                <Card title="Course grade" compact>
                  <div className="flex items-end justify-between gap-3">
                    <p className="text-3xl font-bold">{data.totalCourseGrade.toFixed(2)}</p>
                    <p className="pb-1 text-xs text-muted-foreground">out of 100</p>
                  </div>
                </Card>
              ) : (
                <Card title="Published grading progress" compact>
                  <p className="text-sm font-medium">
                    {data.completedGradeWeight}% of {data.configuredGradeWeight}% course weighting has published results.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A final course grade is shown only when the full configured grade is complete.
                  </p>
                </Card>
              )}

              <Card title="Published grades" compact>
                <div className="space-y-2">
                  {publishedResults.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.result?.feedback || "No written feedback"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold">
                          {item.result?.score}/{item.result?.maxScore}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.result?.percentage}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <AvailabilityCard
              title="Grades"
              message="Grades are not available yet. Published results will appear here when they are released."
            />
          )}
        </TabsContent>

        <TabsContent value="resources" className="mt-3">
          {data.resources.length ? (
            <Card title="Learning resources" compact>
              <div className="grid gap-2 md:grid-cols-2">
                {data.resources.map((item) => (
                  <a
                    key={item.id}
                    href={item.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-border p-3 transition hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between">
                      <FileCheck2 className="h-4 w-4 text-primary" />
                      {item.url ? (
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {item.title || item.resourceType}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.resourceType}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                  </a>
                ))}
              </div>
            </Card>
          ) : (
            <AvailabilityCard
              title="Resources"
              message="Learning resources are not available yet. They will appear here when they are published."
            />
          )}
        </TabsContent>
      </Tabs>

      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        offeringId={offeringId}
        onSubmitted={() => setData({ ...data, feedbackSubmitted: true })}
      />
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="rounded-lg bg-primary/10 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card ${compact ? "p-4" : "p-5"}`}
    >
      <h3 className={`${compact ? "mb-3 text-sm" : "mb-4 text-base"} font-semibold`}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function AvailabilityCard({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{message}</p>
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function AssessmentRubric({
  assessment,
}: {
  assessment: PortalCourseDetail["assessments"][number];
}) {
  if (!assessment.rubricName) return null;
  const criteria = assessment.rubricCriteria ?? [];

  return (
    <details className="mt-2 rounded-lg border border-border p-2.5">
      <summary className="cursor-pointer text-xs font-medium">
        Rubric: {assessment.rubricName}
      </summary>
      <div className="mt-2 space-y-2">
        {criteria.length ? (
          criteria.map((criterion) => (
            <div key={criterion.id} className="rounded bg-muted/40 p-2.5">
              <p className="text-xs font-medium">{criterion.name}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {criterion.levels.map((level) => (
                  <span
                    key={level.id}
                    className="rounded bg-background px-2 py-1 text-[11px]"
                  >
                    {level.label} · {level.points} pts
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            Rubric criteria are not available yet.
          </p>
        )}
      </div>
    </details>
  );
}

function FeedbackDialog({
  open,
  onOpenChange,
  offeringId,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offeringId: string;
  onSubmitted: () => void;
}) {
  const [values, setValues] = useState<CourseFeedbackInput>({
    overallRating: 5,
    teachingClarityRating: 5,
    assessmentClarityRating: 5,
    workload: "appropriate",
    positiveComment: "",
    improvementComment: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await studentPortalApi.submitFeedback(offeringId, values);
      onSubmitted();
      onOpenChange(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not submit feedback",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anonymous course feedback</DialogTitle>
          <DialogDescription>
            Your identity is not stored with this response. One response is
            allowed per class.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <Rating
            label="Overall experience"
            value={values.overallRating}
            onChange={(value) => setValues({ ...values, overallRating: value })}
          />
          <Rating
            label="Teaching clarity"
            value={values.teachingClarityRating}
            onChange={(value) =>
              setValues({ ...values, teachingClarityRating: value })
            }
          />
          <Rating
            label="Assessment clarity"
            value={values.assessmentClarityRating}
            onChange={(value) =>
              setValues({ ...values, assessmentClarityRating: value })
            }
          />
          <label className="block text-sm font-medium">
            Workload
            <select
              className="mt-1 w-full rounded-md border border-input bg-background p-2"
              value={values.workload}
              onChange={(event) =>
                setValues({
                  ...values,
                  workload: event.target.value as CourseFeedbackInput["workload"],
                })
              }
            >
              <option value="light">Light</option>
              <option value="appropriate">Appropriate</option>
              <option value="heavy">Heavy</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            What helped your learning?
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border border-input bg-background p-2"
              value={values.positiveComment}
              onChange={(event) =>
                setValues({ ...values, positiveComment: event.target.value })
              }
            />
          </label>
          <label className="block text-sm font-medium">
            What should improve?
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border border-input bg-background p-2"
              value={values.improvementComment}
              onChange={(event) =>
                setValues({ ...values, improvementComment: event.target.value })
              }
            />
          </label>
          {error ? <p className="text-sm text-status-live">{error}</p> : null}
          <Button className="w-full" disabled={saving}>
            {saving ? "Submitting…" : "Submit anonymous feedback"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Rating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-1 flex gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            type="button"
            key={rating}
            onClick={() => onChange(rating)}
            className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${
              rating === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary"
            }`}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}
