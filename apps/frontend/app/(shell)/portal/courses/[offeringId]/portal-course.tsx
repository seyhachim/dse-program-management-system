"use client";

import { useCallback, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import type { CourseFeedbackInput } from "@dse-pms/shared-types";
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
import { meetingLabel, studentPortalApi } from "@/lib/student-portal";
import { PortalError, PortalLoading, usePortalData } from "../../portal-state";
import { PortalCourseAttendance } from "./portal-course-attendance";

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

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {data.code}
              </span>
              <span className="rounded-lg bg-muted px-3 py-1 text-xs">
                Section {data.sectionCode}
              </span>
              <span className="rounded-lg bg-muted px-3 py-1 text-xs">
                {data.term}
              </span>
            </div>
            <h2 className="mt-3 break-words text-2xl font-bold">{data.title}</h2>
            {data.description ? (
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {data.description}
              </p>
            ) : null}
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

        <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <Info icon={UserRound} label="Lecturer" value={data.lecturer?.name ?? "TBA"} />
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="weekly-notes">Weekly Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card title="Class schedule">
            {data.meetings.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.meetings.map((meeting) => (
                  <div key={meeting.id} className="rounded-xl bg-muted/50 p-4">
                    <p className="font-medium">{meeting.activityType}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {meetingLabel(meeting)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {meeting.room || "Room TBA"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <Muted>No schedule has been published.</Muted>
            )}
          </Card>

          <Card title="Teaching team">
            <div className="space-y-3">
              <div>
                <p className="font-medium">
                  {data.lecturer?.name ?? "Primary lecturer TBA"}
                </p>
                {data.lecturer?.email ? (
                  <p className="text-sm text-muted-foreground">{data.lecturer.email}</p>
                ) : null}
              </div>
              {data.coLecturers.length ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Co-lecturers
                  </p>
                  <div className="mt-1 space-y-1">
                    {data.coLecturers.map((lecturer) => (
                      <p key={lecturer.id} className="text-sm">
                        {lecturer.name}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          {!data.specAvailable ? (
            <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              More course details will be available when they are published.
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <PortalCourseAttendance offeringId={offeringId} />
        </TabsContent>

        <TabsContent value="weekly-notes" className="mt-4">
          <Card title="Weekly Notes">
            <Muted>
              Weekly learning history will appear here when class delivery records are
              available.
            </Muted>
          </Card>
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
    <div className="flex min-w-0 items-center gap-3">
      <span className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h3 className="mb-4 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
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
      setError(reason instanceof Error ? reason.message : "Could not submit feedback");
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
            Your identity is not stored with this response. One response is allowed per
            course section.
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
            onChange={(value) => setValues({ ...values, teachingClarityRating: value })}
          />
          <Rating
            label="Assessment clarity"
            value={values.assessmentClarityRating}
            onChange={(value) => setValues({ ...values, assessmentClarityRating: value })}
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
