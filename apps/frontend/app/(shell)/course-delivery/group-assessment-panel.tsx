"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CourseDeliveryAssessment,
  CourseDeliveryCriterionScore,
  CourseDeliveryRubricCriterion,
  GroupAssessmentWorkspace,
} from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { CheckCircle2, LockKeyhole, Plus, RefreshCcw, Trash2, UsersRound } from "lucide-react";
import { ApiError } from "@/lib/api";
import { courseDeliveryApi } from "@/lib/course-delivery";

type Props = {
  offeringId: string;
  assessment: CourseDeliveryAssessment;
  onChanged: (message: string) => Promise<void>;
};

type GroupDraft = { id: string; name: string };
type WorkspaceGroup = GroupAssessmentWorkspace["groups"][number];
type WorkspaceMember = WorkspaceGroup["members"][number];
type IndividualComponent = WorkspaceGroup["individualComponents"][number];

export function GroupAssessmentPanel({ offeringId, assessment, onChanged }: Props) {
  const [workspace, setWorkspace] = useState<GroupAssessmentWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [assignment, setAssignment] = useState<Record<string, string>>(Object.create(null));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await courseDeliveryApi.groupWorkspace(offeringId, assessment.id);
      setWorkspace(next);
    } catch (reason) {
      setError(messageFrom(reason, "Could not load the group assessment workspace"));
    } finally {
      setLoading(false);
    }
  }, [offeringId, assessment.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!workspace) return;
    const initialGroups = workspace.groups.length
      ? workspace.groups.map((group) => ({ id: group.id, name: group.name }))
      : [{ id: crypto.randomUUID(), name: "Group 1" }];
    setGroups(initialGroups);
    setAssignment(Object.fromEntries(
      workspace.groups.flatMap((group) =>
        group.members.map((member) => [member.enrollmentId, group.id] as const),
      ),
    ));
  }, [workspace]);

  const membershipLocked = Boolean(workspace?.groups.some((group) => group.membershipLockedAt));
  const allPublished = Boolean(workspace?.groups.length) && workspace!.groups.every((group) => group.publishedAt);
  const allFinalized = Boolean(workspace?.groups.length) && workspace!.groups.every((group) => group.finalizedAt);

  const saveGroups = async () => {
    if (!workspace || membershipLocked || groups.some((group) => !group.name.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const next = await courseDeliveryApi.saveGroups(offeringId, assessment.id, {
        groups: groups.map((group) => ({
          id: group.id,
          name: group.name.trim(),
          enrollmentIds: workspace.enrollments
            .filter((enrollment) => assignment[enrollment.enrollmentId] === group.id)
            .map((enrollment) => enrollment.enrollmentId),
        })),
      });
      setWorkspace(next);
      await onChanged("Assessment groups saved. Membership will lock when scoring begins.");
    } catch (reason) {
      setError(messageFrom(reason, "Could not save assessment groups"));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!workspace?.readiness.readyToPublish || allPublished) return;
    if (!window.confirm(`Publish ${assessment.name} results for every enrolled student? Group membership and source scores will be locked.`)) return;
    setBusy(true);
    setError(null);
    try {
      await courseDeliveryApi.publishAssessmentResults({ offeringId, assessmentItemId: assessment.id });
      await onChanged(`${assessment.name} group results published for the full section.`);
      await load();
    } catch (reason) {
      setError(messageFrom(reason, "Could not publish group assessment results"));
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    if (!allPublished || allFinalized) return;
    if (!window.confirm(`Finalize ${assessment.name}? This creates the official locked result state; later changes require reasoned corrections.`)) return;
    setBusy(true);
    setError(null);
    try {
      await courseDeliveryApi.finalizeAssessmentResults({ offeringId, assessmentItemId: assessment.id });
      await onChanged(`${assessment.name} results finalized.`);
      await load();
    } catch (reason) {
      setError(messageFrom(reason, "Could not finalize group assessment results"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Card title="Group assessment workspace"><p className="text-sm text-muted-foreground">Loading groups and scoring evidence…</p></Card>;
  }
  if (error && !workspace) {
    return (
      <Card title="Group assessment workspace">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" className="mt-3" onClick={load}><RefreshCcw />Retry</Button>
      </Card>
    );
  }
  if (!workspace) return null;

  return (
    <div className="space-y-4">
      <Card
        title={workspace.mode === "group" ? "Group assessment workspace" : "Group + Individual assessment workspace"}
        description={workspace.mode === "group"
          ? "Score shared group work once; PMS materializes the same result and rubric evidence to each snapshotted member."
          : `Group ${workspace.groupWeight ?? "—"}% + Individual ${workspace.individualWeight ?? "—"}%. PMS materializes the weighted student result while preserving both evidence sources.`}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <StatusPill label={`${workspace.groups.length} group${workspace.groups.length === 1 ? "" : "s"}`} />
          <StatusPill label={`${workspace.enrollments.length} students`} />
          {membershipLocked ? <StatusPill label="Membership locked" /> : <StatusPill label="Membership editable" />}
          {allFinalized ? <StatusPill label="Finalized" /> : allPublished ? <StatusPill label="Published" /> : null}
        </div>
        <Readiness readiness={workspace.readiness} />
        <div className="mt-4 flex flex-wrap gap-2">
          {!allPublished ? (
            <Button type="button" onClick={publish} disabled={busy || !workspace.readiness.readyToPublish}>
              <CheckCircle2 />{busy ? "Working…" : "Publish assessment"}
            </Button>
          ) : !allFinalized ? (
            <Button type="button" onClick={finalize} disabled={busy}>
              <LockKeyhole />{busy ? "Working…" : "Finalize official results"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={load} disabled={busy}><RefreshCcw />Refresh</Button>
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </Card>

      <Card
        title="Group membership snapshot"
        description={membershipLocked
          ? "Membership is locked because scoring has started. This snapshot is the historical membership used by published results."
          : "Create groups and assign each enrolled student. Scoring locks this membership snapshot."}
      >
        {membershipLocked ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {workspace.groups.map((group) => (
              <div key={group.id} className="rounded-xl border border-border p-4">
                <p className="font-semibold">{group.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{group.members.length} member{group.members.length === 1 ? "" : "s"}</p>
                <div className="mt-3 space-y-1 text-sm">
                  {group.members.map((member) => <p key={member.enrollmentId}>{member.studentName} <span className="text-muted-foreground">· {member.studentCode}</span></p>)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <GroupSetup
            workspace={workspace}
            groups={groups}
            assignment={assignment}
            setGroups={setGroups}
            setAssignment={setAssignment}
            saving={busy}
            onSave={saveGroups}
          />
        )}
      </Card>

      {workspace.groups.map((group) => (
        <GroupScoreCard
          key={`${group.id}-${group.score?.updatedAt ?? "none"}-${group.finalizedAt ?? "draft"}`}
          offeringId={offeringId}
          assessment={assessment}
          workspace={workspace}
          group={group}
          onWorkspace={setWorkspace}
          onChanged={onChanged}
        />
      ))}

      {workspace.audit.length ? (
        <Card title="Group assessment audit history" description="Recent append-only membership, scoring, publication, finalization, and correction events.">
          <div className="space-y-2">
            {workspace.audit.map((event) => (
              <div key={event.id} className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div><span className="font-medium">{humanize(event.action)}</span>{event.reason ? <span className="text-muted-foreground"> · {event.reason}</span> : null}</div>
                <span className="text-xs text-muted-foreground">{event.actorName} · {new Date(event.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function GroupSetup({ workspace, groups, assignment, setGroups, setAssignment, saving, onSave }: {
  workspace: GroupAssessmentWorkspace;
  groups: GroupDraft[];
  assignment: Record<string, string>;
  setGroups: React.Dispatch<React.SetStateAction<GroupDraft[]>>;
  setAssignment: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saving: boolean;
  onSave: () => Promise<void>;
}) {
  const unassigned = workspace.enrollments.filter((student) => !assignment[student.enrollmentId]).length;
  const add = () => setGroups((current) => [...current, { id: crypto.randomUUID(), name: `Group ${current.length + 1}` }]);
  const remove = (id: string) => {
    setGroups((current) => current.filter((group) => group.id !== id));
    setAssignment((current) => Object.fromEntries(Object.entries(current).filter(([, groupId]) => groupId !== id)));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <div key={group.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <Input
              value={group.name}
              maxLength={120}
              aria-label="Group name"
              onChange={(event) => setGroups((current) => current.map((item) => item.id === group.id ? { ...item, name: event.target.value } : item))}
            />
            {groups.length > 1 ? <Button type="button" size="icon" variant="ghost" onClick={() => remove(group.id)} aria-label={`Remove ${group.name}`}><Trash2 /></Button> : null}
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" onClick={add}><Plus />Add group</Button>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)] gap-3 border-b border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">
          <span>Student</span><span>Group</span>
        </div>
        {workspace.enrollments.map((student) => (
          <div key={student.enrollmentId} className="grid grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
            <div><p className="text-sm font-medium">{student.studentName}</p><p className="text-xs text-muted-foreground">{student.studentCode}</p></div>
            <select
              value={assignment[student.enrollmentId] ?? ""}
              onChange={(event) => setAssignment((current) => ({ ...current, [student.enrollmentId]: event.target.value }))}
              className={selectClass}
            >
              <option value="">Unassigned</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name || "Unnamed group"}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSave} disabled={saving || !groups.length || groups.some((group) => !group.name.trim())}>{saving ? "Saving…" : "Save group membership"}</Button>
        <span className="text-xs text-muted-foreground">{unassigned ? `${unassigned} student${unassigned === 1 ? "" : "s"} still unassigned.` : "Every student is assigned."}</span>
      </div>
    </div>
  );
}

function GroupScoreCard({ offeringId, assessment, workspace, group, onWorkspace, onChanged }: {
  offeringId: string;
  assessment: CourseDeliveryAssessment;
  workspace: GroupAssessmentWorkspace;
  group: WorkspaceGroup;
  onWorkspace: (workspace: GroupAssessmentWorkspace) => void;
  onChanged: (message: string) => Promise<void>;
}) {
  return (
    <Card
      title={group.name}
      description={`${group.members.length} snapshotted member${group.members.length === 1 ? "" : "s"}. Shared scoring is entered once and materialized to member results.`}
    >
      <div className="space-y-4">
        <GroupTotalEditor offeringId={offeringId} assessment={assessment} group={group} onWorkspace={onWorkspace} onChanged={onChanged} />
        {workspace.rubricCriteria.some((criterion) => criterion.scoringScope === "group") ? (
          <CriterionEditor
            title="Group rubric criteria"
            description="These ratings are shared evidence for every member of this group."
            criteria={workspace.rubricCriteria.filter((criterion) => criterion.scoringScope === "group")}
            current={group.score?.criterionScores ?? []}
            locked={Boolean(group.publishedAt)}
            disabled={!group.score}
            save={(scores) => courseDeliveryApi.saveGroupCriteria(offeringId, assessment.id, group.id, { scores })}
            onWorkspace={onWorkspace}
            onChanged={() => onChanged(`${group.name} group rubric evidence saved.`)}
          />
        ) : null}

        {workspace.mode === "group_individual" ? (
          <div className="border-t border-border pt-4">
            <div className="mb-3">
              <p className="font-semibold">Individual component</p>
              <p className="text-xs text-muted-foreground">Each member keeps a separate individual score, feedback, optional reasoned adjustment, and individual-scoped rubric evidence.</p>
            </div>
            <div className="space-y-3">
              {group.members.map((member) => (
                <IndividualEditor
                  key={`${member.enrollmentId}-${group.finalizedAt ?? "draft"}`}
                  offeringId={offeringId}
                  assessment={assessment}
                  workspace={workspace}
                  group={group}
                  member={member}
                  component={group.individualComponents.find((item) => item.enrollmentId === member.enrollmentId) ?? null}
                  onWorkspace={onWorkspace}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function GroupTotalEditor({ offeringId, assessment, group, onWorkspace, onChanged }: {
  offeringId: string;
  assessment: CourseDeliveryAssessment;
  group: WorkspaceGroup;
  onWorkspace: (workspace: GroupAssessmentWorkspace) => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [score, setScore] = useState(group.score ? String(group.score.score) : "");
  const [maxScore, setMaxScore] = useState(group.score ? String(group.score.maxScore) : "100");
  const [feedback, setFeedback] = useState(group.score?.feedback ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const published = Boolean(group.publishedAt);
  const finalized = Boolean(group.finalizedAt);

  const submit = async () => {
    const numericScore = Number(score), numericMax = Number(maxScore);
    if (!validScore(numericScore, numericMax)) { setError("Enter a valid group score that does not exceed the maximum."); return; }
    if (finalized && !reason.trim()) { setError("A correction reason is required for finalized results."); return; }
    setSaving(true); setError(null);
    try {
      const next = finalized && group.score
        ? await courseDeliveryApi.correctGroupScore(offeringId, assessment.id, group.id, { score: numericScore, maxScore: numericMax, feedback, reason: reason.trim(), expectedUpdatedAt: group.score.updatedAt })
        : await courseDeliveryApi.saveGroupScore(offeringId, assessment.id, group.id, { score: numericScore, maxScore: numericMax, feedback });
      onWorkspace(next);
      await onChanged(finalized ? `${group.name} finalized source corrected with audit history.` : `${group.name} draft score saved.`);
      setReason("");
    } catch (cause) { setError(messageFrom(cause, finalized ? "Could not correct finalized group score" : "Could not save group score")); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold">Shared group score</p><p className="text-xs text-muted-foreground">Applied to every snapshotted member before any individual component is calculated.</p></div>
        {finalized ? <StatusPill label="Finalized · correction only" /> : published ? <StatusPill label="Published · locked" /> : group.score ? <StatusPill label="Draft" /> : null}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[120px_120px_minmax(0,1fr)_auto] xl:items-end">
        <Field label="Score"><Input type="number" min="0" step="0.01" value={score} onChange={(event) => setScore(event.target.value)} disabled={published && !finalized} /></Field>
        <Field label="Out of"><Input type="number" min="0.01" step="0.01" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} disabled={published && !finalized} /></Field>
        <Field label="Group feedback"><Input value={feedback} maxLength={5000} onChange={(event) => setFeedback(event.target.value)} disabled={published && !finalized} placeholder="Optional shared feedback" /></Field>
        {!published || finalized ? <Button type="button" onClick={submit} disabled={saving || !score}>{saving ? "Saving…" : finalized ? "Apply correction" : "Save group draft"}</Button> : <Button type="button" variant="outline" disabled><LockKeyhole />Locked</Button>}
      </div>
      {finalized ? <Field label="Correction reason" className="mt-3"><Input value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} placeholder="Required: explain why the official group source must change" /></Field> : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function IndividualEditor({ offeringId, assessment, workspace, group, member, component, onWorkspace, onChanged }: {
  offeringId: string;
  assessment: CourseDeliveryAssessment;
  workspace: GroupAssessmentWorkspace;
  group: WorkspaceGroup;
  member: WorkspaceMember;
  component: IndividualComponent | null;
  onWorkspace: (workspace: GroupAssessmentWorkspace) => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [score, setScore] = useState(component ? String(component.score) : "");
  const [maxScore, setMaxScore] = useState(component ? String(component.maxScore) : "100");
  const [feedback, setFeedback] = useState(component?.feedback ?? "");
  const [adjustment, setAdjustment] = useState(component?.adjustmentPoints ? String(component.adjustmentPoints) : "0");
  const [adjustmentReason, setAdjustmentReason] = useState(component?.adjustmentReason ?? "");
  const [correctionReason, setCorrectionReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const published = Boolean(group.publishedAt);
  const finalized = Boolean(group.finalizedAt);

  const submit = async () => {
    const numericScore = Number(score), numericMax = Number(maxScore), numericAdjustment = Number(adjustment || 0);
    if (!validScore(numericScore + numericAdjustment, numericMax) || numericScore < 0) { setError("Enter a valid individual score and adjustment within the maximum."); return; }
    if (numericAdjustment !== 0 && !adjustmentReason.trim()) { setError("Explain any individual adjustment."); return; }
    if (finalized && !correctionReason.trim()) { setError("A correction reason is required for finalized results."); return; }
    setSaving(true); setError(null);
    try {
      const payload = { score: numericScore, maxScore: numericMax, feedback, adjustmentPoints: numericAdjustment, adjustmentReason: adjustmentReason.trim() };
      const next = finalized && component
        ? await courseDeliveryApi.correctIndividualComponent(offeringId, assessment.id, member.enrollmentId, { ...payload, reason: correctionReason.trim(), expectedUpdatedAt: component.updatedAt })
        : await courseDeliveryApi.saveIndividualComponent(offeringId, assessment.id, member.enrollmentId, payload);
      onWorkspace(next);
      await onChanged(finalized ? `${member.studentName}'s finalized individual source corrected.` : `${member.studentName}'s individual draft saved.`);
      setCorrectionReason("");
    } catch (cause) { setError(messageFrom(cause, finalized ? "Could not correct finalized individual component" : "Could not save individual component")); }
    finally { setSaving(false); }
  };

  const individualCriteria = workspace.rubricCriteria.filter((criterion) => criterion.scoringScope === "individual");

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold">{member.studentName}</p><p className="text-xs text-muted-foreground">{member.studentCode}</p></div>
        {finalized ? <StatusPill label="Finalized · correction only" /> : published ? <StatusPill label="Published · locked" /> : component ? <StatusPill label="Draft" /> : null}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[110px_110px_110px_minmax(0,1fr)_auto] xl:items-end">
        <Field label="Score"><Input type="number" min="0" step="0.01" value={score} onChange={(event) => setScore(event.target.value)} disabled={published && !finalized} /></Field>
        <Field label="Out of"><Input type="number" min="0.01" step="0.01" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} disabled={published && !finalized} /></Field>
        <Field label="Adjustment"><Input type="number" step="0.01" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} disabled={published && !finalized} /></Field>
        <Field label="Individual feedback"><Input value={feedback} maxLength={5000} onChange={(event) => setFeedback(event.target.value)} disabled={published && !finalized} placeholder="Optional feedback" /></Field>
        {!published || finalized ? <Button type="button" onClick={submit} disabled={saving || !score}>{saving ? "Saving…" : finalized ? "Apply correction" : "Save individual"}</Button> : <Button type="button" variant="outline" disabled><LockKeyhole />Locked</Button>}
      </div>
      {Number(adjustment || 0) !== 0 ? <Field label="Adjustment reason" className="mt-3"><Input value={adjustmentReason} maxLength={2000} onChange={(event) => setAdjustmentReason(event.target.value)} disabled={published && !finalized} placeholder="Required when adjustment is non-zero" /></Field> : null}
      {finalized ? <Field label="Correction reason" className="mt-3"><Input value={correctionReason} maxLength={2000} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Required: explain why the official individual source must change" /></Field> : null}
      {individualCriteria.length ? (
        <CriterionEditor
          title="Individual rubric criteria"
          description="Only individual-scoped criterion ratings are entered here."
          criteria={individualCriteria}
          current={component?.criterionScores ?? []}
          locked={published}
          disabled={!component}
          save={(scores) => courseDeliveryApi.saveIndividualCriteria(offeringId, assessment.id, member.enrollmentId, { scores })}
          onWorkspace={onWorkspace}
          onChanged={() => onChanged(`${member.studentName}'s individual rubric evidence saved.`)}
        />
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function CriterionEditor({ title, description, criteria, current, locked, disabled, save, onWorkspace, onChanged }: {
  title: string;
  description: string;
  criteria: CourseDeliveryRubricCriterion[];
  current: CourseDeliveryCriterionScore[];
  locked: boolean;
  disabled: boolean;
  save: (scores: Array<{ criterionId: string; score: number; rubricLevelId: string }>) => Promise<GroupAssessmentWorkspace>;
  onWorkspace: (workspace: GroupAssessmentWorkspace) => void;
  onChanged: () => Promise<void>;
}) {
  const initial = useMemo(() => Object.fromEntries(current.map((score) => [score.criterionId, score.rubricLevelId ?? ""])), [current]);
  const [levels, setLevels] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setLevels(initial); }, [initial]);

  const submit = async () => {
    const scores = criteria.flatMap((criterion) => {
      const level = criterion.levels.find((candidate) => candidate.id === levels[criterion.id]);
      return level ? [{ criterionId: criterion.id, score: level.points, rubricLevelId: level.id }] : [];
    });
    setSaving(true); setError(null);
    try {
      onWorkspace(await save(scores));
      await onChanged();
    } catch (cause) { setError(messageFrom(cause, "Could not save rubric criterion evidence")); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {criteria.map((criterion) => (
          <label key={criterion.id} className="text-sm font-medium">
            <span>{criterion.name}</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">{criterion.cloCodes.length ? `→ ${criterion.cloCodes.join(", ")}` : "No CLO evidence mapping"}</span>
            <select value={levels[criterion.id] ?? ""} onChange={(event) => setLevels((state) => ({ ...state, [criterion.id]: event.target.value }))} disabled={locked || disabled} className={selectClass}>
              <option value="">Not scored</option>
              {criterion.levels.map((level) => <option key={level.id} value={level.id}>{level.label} · {level.points} pts</option>)}
            </select>
          </label>
        ))}
      </div>
      {!locked ? <Button type="button" variant="outline" className="mt-3" onClick={submit} disabled={saving || disabled}>{saving ? "Saving rubric…" : "Save rubric scores"}</Button> : <p className="mt-3 text-xs text-muted-foreground">Published rubric evidence is immutable; official total corrections remain separately audited.</p>}
      {disabled ? <p className="mt-2 text-xs text-muted-foreground">Save the source total first.</p> : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function Readiness({ readiness }: { readiness: GroupAssessmentWorkspace["readiness"] }) {
  if (readiness.readyToPublish) {
    return <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">Ready to publish: membership, source scores, weights, and required rubric evidence are complete.</div>;
  }
  const items = [
    [readiness.unassignedEnrollmentIds.length, "unassigned student"],
    [readiness.emptyGroupIds.length, "empty group"],
    [readiness.missingGroupScoreIds.length, "group missing a score"],
    [readiness.missingGroupCriterionGroupIds.length, "group missing rubric evidence"],
    [readiness.missingIndividualEnrollmentIds.length, "student missing individual score"],
    [readiness.missingIndividualCriterionEnrollmentIds.length, "student missing individual rubric evidence"],
  ] as const;
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
      <p className="font-medium">Not ready to publish.</p>
      <p className="mt-1 text-xs">{items.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}${count === 1 ? "" : "s"}`).join(" · ") || (readiness.invalidWeightConfiguration ? "Group + Individual weights are invalid." : "Create and complete the assessment groups.")}</p>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-4"><h3 className="font-semibold">{title}</h3>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>{children}</section>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block text-xs font-semibold text-foreground ${className}`}><span className="mb-1 block">{label}</span>{children}</label>;
}

function StatusPill({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold"><UsersRound className="h-3 w-3" />{label}</span>;
}

function validScore(score: number, max: number): boolean {
  return Number.isFinite(score) && Number.isFinite(max) && score >= 0 && max > 0 && score <= max;
}

function messageFrom(reason: unknown, fallback: string): string {
  return reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : fallback;
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

const selectClass = "mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
