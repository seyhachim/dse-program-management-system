"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  LockKeyhole,
  MessageSquareText,
  Send,
  Star,
  UsersRound,
} from "lucide-react";
import type {
  CourseDeliveryAssessment,
  CourseDeliveryOffering,
  CourseDeliveryResultRow,
} from "@dse-pms/shared-types";
import { Button, Input, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@dse-pms/ui";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { courseDeliveryApi, toDateTimeLocal } from "@/lib/course-delivery";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { Topbar } from "../topbar";
import { GroupAssessmentPanel } from "./group-assessment-panel";

export function CourseDeliveryClient() {
  const { me, loading: meLoading } = useMe();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const queryScope = { userId: me?.id ?? "pending" };
  const deliveryKey = protectedQueryKey(queryScope, "course-delivery", "offerings");
  const deliveryQuery = useQuery({
    queryKey: deliveryKey,
    queryFn: () => courseDeliveryApi.offerings(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.review,
  });
  const offerings = deliveryQuery.data ?? [];
  const hasData = deliveryQuery.data !== undefined;
  const loading = meLoading || (!hasData && deliveryQuery.isPending);
  const error = !hasData && deliveryQuery.isError
    ? deliveryQuery.error instanceof ApiError
      ? deliveryQuery.error.message
      : "Could not load course delivery"
    : null;

  useEffect(() => {
    setSelectedId((current) =>
      offerings.some((row) => row.offeringId === current) ? current : (offerings[0]?.offeringId ?? ""),
    );
  }, [offerings]);

  const selected = offerings.find((row) => row.offeringId === selectedId) ?? null;
  const changed = async (message: string) => {
    setNotice(message);
    await queryClient.invalidateQueries({ queryKey: deliveryKey, exact: true });
  };
  const retry = async () => {
    await deliveryQuery.refetch();
  };

  return (
    <>
      <Topbar
        title="Course Delivery"
        subtitle="Keep students informed, manage draft marks safely, publish results, and review privacy-safe feedback."
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <QueryRefreshStatus
            hasData={hasData}
            isPending={deliveryQuery.isPending}
            isFetching={deliveryQuery.isFetching}
            isError={deliveryQuery.isError}
            label="Course delivery"
          />
          {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={retry} /> : !offerings.length ? (
            <EmptyState />
          ) : selected ? (
            <>
              <CourseHeader offerings={offerings} selected={selected} onSelect={setSelectedId} />
              {notice ? (
                <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />{notice}
                </div>
              ) : null}
              {selected.specificationStatus !== "Approved" ? (
                <div className="rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning">
                  The course specification is {selected.specificationStatus?.toLowerCase() ?? "not available"}.
                  Students will see assessment details only after approval.
                </div>
              ) : null}
              <Tabs defaultValue="announcements">
                <TabsList className="max-w-full overflow-x-auto">
                  <TabsTrigger value="announcements">Announcements</TabsTrigger>
                  <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
                  <TabsTrigger value="results">Results</TabsTrigger>
                  <TabsTrigger value="feedback">Feedback</TabsTrigger>
                </TabsList>
                <TabsContent value="announcements" className="mt-4">
                  <AnnouncementsPanel offering={selected} onChanged={changed} />
                </TabsContent>
                <TabsContent value="deadlines" className="mt-4">
                  <DeadlinesPanel offering={selected} onChanged={changed} />
                </TabsContent>
                <TabsContent value="results" className="mt-4">
                  <ResultsPanel offering={selected} onChanged={changed} />
                </TabsContent>
                <TabsContent value="feedback" className="mt-4">
                  <FeedbackPanel offering={selected} />
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}

function CourseHeader({ offerings, selected, onSelect }: {
  offerings: CourseDeliveryOffering[];
  selected: CourseDeliveryOffering;
  onSelect: (id: string) => void;
}) {
  const publishedResults = selected.assessments.reduce(
    (total, assessment) => total + assessment.results.filter((row) => row.publishedAt).length,
    0,
  );
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-primary">{selected.code}</span>
            <span className="rounded-lg bg-muted px-2.5 py-1">Section {selected.sectionCode}</span>
            <span className="rounded-lg bg-muted px-2.5 py-1">{selected.term}</span>
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">{selected.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft marks remain private until you explicitly publish a complete assessment.
          </p>
        </div>
        <label className="text-sm font-medium">
          Course section
          <select
            value={selected.offeringId}
            onChange={(event) => onSelect(event.target.value)}
            className="mt-1 block h-10 min-w-72 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {offerings.map((offering) => (
              <option key={offering.offeringId} value={offering.offeringId}>
                {offering.code} · Section {offering.sectionCode} · {offering.term}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={UsersRound} label="Enrolled students" value={String(selected.studentCount)} />
        <Metric icon={ClipboardCheck} label="Assessments" value={String(selected.assessments.length)} />
        <Metric icon={Bell} label="Announcements" value={String(selected.announcements.length)} />
        <Metric icon={CheckCircle2} label="Published results" value={String(publishedResults)} />
      </div>
    </section>
  );
}

function AnnouncementsPanel({ offering, onChanged }: PanelProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      await courseDeliveryApi.publishAnnouncement({ offeringId: offering.offeringId, title, body, pinned });
      setTitle(""); setBody(""); setPinned(false);
      await onChanged("Announcement published to this section.");
    } catch (reason) {
      setError(messageFrom(reason, "Could not publish announcement"));
    } finally { setSaving(false); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <Panel title="Publish announcement" description="Students see it immediately in their portal.">
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="e.g. Lab moved to Room 302" /></Field>
          <Field label="Message"><textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} required rows={7} placeholder="Write a clear, concise update…" className={textareaClass} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-primary" />Pin this announcement</label>
          {error ? <InlineError>{error}</InlineError> : null}
          <Button disabled={saving || !title.trim() || !body.trim()}><Send />{saving ? "Publishing…" : "Publish announcement"}</Button>
        </form>
      </Panel>
      <Panel title="Published announcements" description={`${offering.announcements.length} announcement${offering.announcements.length === 1 ? "" : "s"} in this section.`}>
        <div className="space-y-3">
          {offering.announcements.map((item) => (
            <article key={item.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div><h4 className="font-semibold">{item.title}</h4><p className="mt-1 text-xs text-muted-foreground">{item.authorName} · {formatDate(item.publishedAt)}</p></div>
                {item.pinned ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">Pinned</span> : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
            </article>
          ))}
          {!offering.announcements.length ? <Muted>No announcements published yet.</Muted> : null}
        </div>
      </Panel>
    </div>
  );
}

function DeadlinesPanel({ offering, onChanged }: PanelProps) {
  return (
    <Panel title="Assessment deadlines" description="Set the exact date and time students will see for each assessment.">
      <div className="space-y-3">
        {offering.assessments.map((assessment) => (
          <DeadlineRow key={`${assessment.id}-${assessment.dueAt}`} offeringId={offering.offeringId} assessment={assessment} onChanged={onChanged} />
        ))}
        {!offering.assessments.length ? <Muted>Add active assessments to the course specification first.</Muted> : null}
      </div>
    </Panel>
  );
}

function DeadlineRow({ offeringId, assessment, onChanged }: { offeringId: string; assessment: CourseDeliveryAssessment; onChanged: (message: string) => Promise<void> }) {
  const [dueAt, setDueAt] = useState(toDateTimeLocal(assessment.dueAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!dueAt) return;
    setSaving(true); setError(null);
    try {
      await courseDeliveryApi.setDeadline({ offeringId, assessmentItemId: assessment.id, dueAt: new Date(dueAt).toISOString() });
      await onChanged(`${assessment.name} deadline updated.`);
    } catch (reason) { setError(messageFrom(reason, "Could not update deadline")); }
    finally { setSaving(false); }
  };
  return (
    <div className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
      <div><p className="font-semibold">{assessment.name}</p><p className="mt-1 text-xs text-muted-foreground">{assessment.weight === null ? "Weight not set" : `${assessment.weight}%`} · {assessment.type}{assessment.dueWeek ? ` · Planned week ${assessment.dueWeek}` : ""}</p>{error ? <InlineError>{error}</InlineError> : null}</div>
      <Field label="Due date and time"><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
      <Button variant="outline" type="button" onClick={save} disabled={saving || !dueAt}><CalendarClock />{saving ? "Saving…" : assessment.dueAt ? "Update" : "Set deadline"}</Button>
    </div>
  );
}

function ResultsPanel({ offering, onChanged }: PanelProps) {
  const [assessmentId, setAssessmentId] = useState(offering.assessments[0]?.id ?? "");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setAssessmentId(offering.assessments[0]?.id ?? ""); }, [offering.offeringId]);
  const assessment = offering.assessments.find((item) => item.id === assessmentId) ?? offering.assessments[0];
  const publishedCount = assessment?.results.filter((row) => row.publishedAt).length ?? 0;
  const draftCount = assessment?.results.filter((row) => row.score !== null && !row.publishedAt).length ?? 0;
  const missingCount = assessment?.results.filter((row) => row.score === null).length ?? 0;
  const allPublished = Boolean(assessment?.results.length) && publishedCount === assessment?.results.length;
  const readyToPublish = Boolean(assessment?.results.length) && missingCount === 0 && !allPublished;

  const publishAssessment = async () => {
    if (!assessment || !readyToPublish) return;
    const confirmed = window.confirm(
      `Publish ${assessment.name} results for all ${assessment.results.length} students? Published marks will be visible to students and locked against ordinary edits.`,
    );
    if (!confirmed) return;
    setPublishing(true); setError(null);
    try {
      await courseDeliveryApi.publishAssessmentResults({
        offeringId: offering.offeringId,
        assessmentItemId: assessment.id,
      });
      await onChanged(`${assessment.name} results published for the full section.`);
    } catch (reason) {
      setError(messageFrom(reason, "Could not publish assessment results"));
    } finally { setPublishing(false); }
  };

  return (
    <div className="space-y-4">
      <Panel title="Assessment markbook" description="Save marks as private drafts first. Publication is a separate class-level action after every student row is complete.">
        {offering.assessments.length ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <label className="block max-w-xl flex-1 text-sm font-medium">Assessment
              <select value={assessment?.id} onChange={(e) => setAssessmentId(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                {offering.assessments.map((item) => <option key={item.id} value={item.id}>{item.name} {item.weight === null ? "" : `(${item.weight}%)`}</option>)}
              </select>
            </label>
            {assessment?.mode === "individual" ? (
              <Button type="button" onClick={publishAssessment} disabled={publishing || !readyToPublish}>
                <CheckCircle2 />{publishing ? "Publishing…" : allPublished ? "Published & locked" : "Publish assessment"}
              </Button>
            ) : null}
          </div>
        ) : <Muted>Add active assessments to the course specification first.</Muted>}
        {assessment?.mode === "individual" ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge tone="neutral" label={`${draftCount} draft`} icon={false} />
              <StatusBadge tone="success" label={`${publishedCount} published`} icon={false} />
              <StatusBadge tone="warning" label={`${missingCount} missing`} icon={false} />
            </div>
            {missingCount > 0 ? <p className="mt-3 text-sm text-muted-foreground">Complete all {missingCount} missing student mark{missingCount === 1 ? "" : "s"} before publishing this assessment.</p> : null}
            {publishedCount > 0 && !allPublished ? <p className="mt-3 text-sm text-warning">Legacy partially published results detected. Existing published rows stay locked; complete the remaining drafts, then publish the rest.</p> : null}
          </>
        ) : assessment ? (
          <p className="mt-3 text-sm text-muted-foreground">This assessment uses {assessment.mode === "group" ? "Group" : "Group + Individual"} scoring. Configure membership and source evidence in the group workspace below.</p>
        ) : null}
        {error ? <InlineError>{error}</InlineError> : null}
      </Panel>
      {assessment && assessment.mode !== "individual" ? (
        <GroupAssessmentPanel offeringId={offering.offeringId} assessment={assessment} onChanged={onChanged} />
      ) : assessment ? (
        <Panel title={assessment.name} description={allPublished ? "Published results are locked against ordinary edits." : `${draftCount} of ${assessment.results.length} student marks saved as drafts.`}>
          <div className="space-y-3">
            {assessment.results.map((row) => <ResultRow key={row.enrollmentId} assessment={assessment} row={row} onChanged={onChanged} />)}
            {!assessment.results.length ? <Muted>No students are enrolled in this section.</Muted> : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function ResultRow({ assessment, row, onChanged }: { assessment: CourseDeliveryAssessment; row: CourseDeliveryResultRow; onChanged: (message: string) => Promise<void> }) {
  const [score, setScore] = useState(row.score === null ? "" : String(row.score));
  const [maxScore, setMaxScore] = useState(row.maxScore === null ? "100" : String(row.maxScore));
  const [feedback, setFeedback] = useState(row.feedback);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = Boolean(row.publishedAt);
  const save = async () => {
    const numericScore = Number(score), numericMax = Number(maxScore);
    if (!Number.isFinite(numericScore) || !Number.isFinite(numericMax) || numericScore < 0 || numericMax <= 0 || numericScore > numericMax) {
      setError("Enter a valid score that does not exceed the maximum."); return;
    }
    setSaving(true); setError(null);
    try {
      await courseDeliveryApi.saveResult({ enrollmentId: row.enrollmentId, assessmentItemId: assessment.id, score: numericScore, maxScore: numericMax, feedback });
      await onChanged(`${row.studentName}'s draft mark saved.`);
    } catch (reason) { setError(messageFrom(reason, "Could not save draft result")); }
    finally { setSaving(false); }
  };
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="min-w-52 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{row.studentName}</p>
            {locked ? (
              <StatusBadge tone="success" label="Published · locked" icon={false} />
            ) : row.score !== null ? (
              <StatusBadge tone="neutral" label="Draft" icon={false} />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{row.studentCode}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 xl:w-52">
          <Field label="Score"><Input type="number" min="0" step="0.01" value={score} onChange={(e) => setScore(e.target.value)} disabled={locked} /></Field>
          <Field label="Out of"><Input type="number" min="0.01" step="0.01" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} disabled={locked} /></Field>
        </div>
        <Field label="Student feedback" className="xl:min-w-72 xl:flex-[1.5]"><Input value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={5000} placeholder="Optional feedback" disabled={locked} /></Field>
        {locked ? (
          <Button type="button" variant="outline" disabled><LockKeyhole />Locked</Button>
        ) : (
          <Button type="button" onClick={save} disabled={saving || score === ""}><CheckCircle2 />{saving ? "Saving…" : "Save draft"}</Button>
        )}
      </div>
      {assessment.rubricCriteria.length > 0 ? (
        <CriterionScoreEditor assessment={assessment} row={row} locked={locked} onChanged={onChanged} />
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}

function CriterionScoreEditor({ assessment, row, locked, onChanged }: { assessment: CourseDeliveryAssessment; row: CourseDeliveryResultRow; locked: boolean; onChanged: (message: string) => Promise<void> }) {
  const [levels, setLevels] = useState<Record<string, string>>(
    Object.fromEntries(row.criterionScores.map((score) => [score.criterionId, score.rubricLevelId ?? ""])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const scores = assessment.rubricCriteria.flatMap((criterion) => {
      const levelId = levels[criterion.id];
      const level = criterion.levels.find((candidate) => candidate.id === levelId);
      return level ? [{ criterionId: criterion.id, score: level.points, rubricLevelId: level.id }] : [];
    });
    setSaving(true); setError(null);
    try {
      await courseDeliveryApi.saveCriterionScores({
        enrollmentId: row.enrollmentId,
        assessmentItemId: assessment.id,
        scores,
      });
      await onChanged(`${row.studentName}'s rubric criterion scores saved.`);
    } catch (reason) {
      setError(messageFrom(reason, "Could not save rubric criterion scores"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-semibold">Rubric criterion evidence</p>
      <p className="mt-1 text-xs text-muted-foreground">Criterion ratings contribute only to explicitly mapped CLO evidence. The assessment's local course-grade weight is unchanged.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {assessment.rubricCriteria.map((criterion) => (
          <label key={criterion.id} className="text-sm font-medium">
            <span>{criterion.name}</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">{criterion.cloCodes.length ? `→ ${criterion.cloCodes.join(", ")}` : "No CLO evidence mapping"}</span>
            <select
              value={levels[criterion.id] ?? ""}
              onChange={(event) => setLevels((current) => ({ ...current, [criterion.id]: event.target.value }))}
              disabled={locked}
              className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Not scored</option>
              {criterion.levels.map((level) => (
                <option key={level.id} value={level.id}>{level.label} · {level.points} pts</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {!locked ? <Button type="button" variant="outline" className="mt-3" onClick={save} disabled={saving}>{saving ? "Saving rubric…" : "Save rubric scores"}</Button> : null}
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}

function FeedbackPanel({ offering }: { offering: CourseDeliveryOffering }) {
  const summary = offering.feedback;
  if (!summary.available) {
    return (
      <Panel title="Anonymous feedback" description="Privacy protection is active for this section.">
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <LockKeyhole className="mx-auto h-9 w-9 text-primary" />
          <h3 className="mt-3 font-semibold">Waiting for more responses</h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            {summary.responseCount} of {summary.minimumResponses} required responses received. Ratings, workload, and comments remain hidden until the privacy threshold is reached.
          </p>
        </div>
      </Panel>
    );
  }
  const total = Math.max(summary.responseCount, 1);
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={MessageSquareText} label="Anonymous responses" value={String(summary.responseCount)} />
        <Metric icon={Star} label="Overall experience" value={`${summary.averages?.overall ?? 0}/5`} />
        <Metric icon={Star} label="Teaching clarity" value={`${summary.averages?.teachingClarity ?? 0}/5`} />
        <Metric icon={Star} label="Assessment clarity" value={`${summary.averages?.assessmentClarity ?? 0}/5`} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Workload perception" description="Aggregated across all anonymous responses.">
          <div className="space-y-4">{(["light", "appropriate", "heavy"] as const).map((key) => <WorkloadBar key={key} label={key} count={summary.workload[key]} total={total} />)}</div>
        </Panel>
        <Panel title="What helped learning" description="Comments are shown without student identity."><CommentList comments={summary.positiveComments} empty="No positive comments submitted." /></Panel>
        <div className="lg:col-start-2"><Panel title="What should improve" description="Use recurring themes for your next teaching adjustment."><CommentList comments={summary.improvementComments} empty="No improvement comments submitted." /></Panel></div>
      </div>
    </div>
  );
}

function WorkloadBar({ label, count, total }: { label: string; count: number; total: number }) {
  const percent = Math.round((count / total) * 100);
  return <div><div className="mb-1 flex justify-between text-sm"><span className="capitalize">{label}</span><span className="text-muted-foreground">{count} · {percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div></div>;
}

function CommentList({ comments, empty }: { comments: string[]; empty: string }) {
  return <div className="space-y-2">{comments.map((comment, index) => <blockquote key={`${index}-${comment}`} className="rounded-xl bg-muted/40 p-3 text-sm">“{comment}”</blockquote>)}{!comments.length ? <Muted>{empty}</Muted> : null}</div>;
}

type PanelProps = { offering: CourseDeliveryOffering; onChanged: (message: string) => Promise<void> };
const textareaClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="rounded-xl border border-border bg-card p-5 shadow-sm"><h3 className="font-semibold">{title}</h3>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}<div className="mt-4">{children}</div></section>; }
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block text-sm font-medium ${className}`}>{label}<div className="mt-1">{children}</div></label>; }
function Metric({ icon: Icon, label, value }: { icon: typeof Bell; label: string; value: string }) { return <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p></div>; }
function Muted({ children }: { children: React.ReactNode }) { return <p className="text-sm text-muted-foreground">{children}</p>; }
function InlineError({ children }: { children: React.ReactNode }) { return <p className="mt-2 text-sm text-destructive">{children}</p>; }
function messageFrom(reason: unknown, fallback: string) { return reason instanceof ApiError || reason instanceof Error ? reason.message : fallback; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not published"; }
function LoadingState() { return <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading your course sections…</div>; }
function ErrorState({ message, retry }: { message: string; retry: () => Promise<void> }) { return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"><p className="text-sm text-destructive">{message}</p><Button variant="outline" className="mt-4" onClick={() => void retry()}>Try again</Button></div>; }
function EmptyState() { return <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center"><ClipboardCheck className="mx-auto h-9 w-9 text-muted-foreground" /><h2 className="mt-3 font-semibold">No assigned course sections</h2><p className="mt-1 text-sm text-muted-foreground">Course delivery appears after you are assigned as a primary or co-lecturer.</p></div>; }