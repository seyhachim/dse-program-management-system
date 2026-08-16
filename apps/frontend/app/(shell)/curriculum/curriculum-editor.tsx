"use client";

import { useMemo, useState } from "react";
import type {
  CourseType,
  CreateCurriculumRevisionInput,
  CurriculumDraftPlacementInput,
  ProgrammeCurriculumRead,
  ProgrammeCurriculumRevisionTrigger,
} from "@dse-pms/shared-types";
import { COURSE_TYPES, PROGRAMME_CURRICULUM_REVISION_TRIGGERS } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { coursesApi, type CourseView } from "@/lib/courses";
import { curriculumApi, revisionTriggerLabel } from "@/lib/curriculum";

interface CurriculumEditorProps {
  data: ProgrammeCurriculumRead;
  canWrite: boolean;
  onSaved: (data: ProgrammeCurriculumRead) => void;
}

type DraftPlacement = CurriculumDraftPlacementInput & {
  code: string;
  title: string;
};

function flattenPlacements(data: ProgrammeCurriculumRead): DraftPlacement[] {
  return data.years.flatMap((year) =>
    year.semesters.flatMap((semester) =>
      semester.courses.map((course) => ({
        courseId: course.courseId,
        code: course.code,
        title: course.title,
        yearLevel: course.yearLevel,
        semester: course.semester,
        credits: course.credits,
        courseType: course.courseType,
        sortOrder: course.sortOrder,
      })),
    ),
  );
}

function normalizeSortOrder(placements: DraftPlacement[]): CurriculumDraftPlacementInput[] {
  const counters = new Map<string, number>();
  return placements.map(({ code: _code, title: _title, ...placement }) => {
    const group = `${placement.yearLevel}:${placement.semester}`;
    const sortOrder = counters.get(group) ?? 0;
    counters.set(group, sortOrder + 1);
    return { ...placement, sortOrder };
  });
}

export function CurriculumEditor({ data, canWrite, onSaved }: CurriculumEditorProps) {
  const version = data.selectedVersion;
  const [editing, setEditing] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [placements, setPlacements] = useState<DraftPlacement[]>(() => flattenPlacements(data));
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [cohortLabel, setCohortLabel] = useState(version.cohortLabel);
  const [intakeYear, setIntakeYear] = useState(version.intakeYear?.toString() ?? "");
  const [academicYear, setAcademicYear] = useState(version.academicYear);
  const [effectiveFrom, setEffectiveFrom] = useState(version.effectiveFrom ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revisionType, setRevisionType] = useState<"Minor" | "Major">("Minor");
  const [revisionTrigger, setRevisionTrigger] = useState<ProgrammeCurriculumRevisionTrigger>("ProgrammeCoordinator");
  const [revisionReason, setRevisionReason] = useState("");
  const [changeSummary, setChangeSummary] = useState("");

  const assignedCourseIds = useMemo(
    () => new Set(placements.map((placement) => placement.courseId)),
    [placements],
  );
  const availableCourses = courses.filter((course) => !assignedCourseIds.has(course.id));

  const beginEdit = async () => {
    setMessage(null);
    setPlacements(flattenPlacements(data));
    setCohortLabel(version.cohortLabel);
    setIntakeYear(version.intakeYear?.toString() ?? "");
    setAcademicYear(version.academicYear);
    setEffectiveFrom(version.effectiveFrom ?? "");
    try {
      const list = await coursesApi.list();
      setCourses(list);
      setSelectedCourseId(list.find((course) => !assignedCourseIds.has(course.id))?.id ?? "");
      setEditing(true);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not load courses for editing");
    }
  };

  const updatePlacement = <K extends keyof DraftPlacement>(
    courseId: string,
    key: K,
    value: DraftPlacement[K],
  ) => {
    setPlacements((current) =>
      current.map((placement) =>
        placement.courseId === courseId ? { ...placement, [key]: value } : placement,
      ),
    );
  };

  const movePlacement = (courseId: string, direction: -1 | 1) => {
    setPlacements((current) => {
      const index = current.findIndex((placement) => placement.courseId === courseId);
      if (index < 0) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const addCourse = () => {
    const course = courses.find((item) => item.id === selectedCourseId);
    if (!course || assignedCourseIds.has(course.id)) return;
    setPlacements((current) => [
      ...current,
      {
        courseId: course.id,
        code: course.code,
        title: course.title,
        yearLevel: 1,
        semester: "First",
        credits: course.credits ?? 0,
        courseType: course.courseType ?? "Core",
        sortOrder: current.length,
      },
    ]);
    const next = availableCourses.find((item) => item.id !== course.id);
    setSelectedCourseId(next?.id ?? "");
  };

  const saveDraft = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await curriculumApi.saveDraft(data.curriculum.id, version.id, {
        expectedUpdatedAt: version.updatedAt,
        cohortLabel,
        intakeYear: intakeYear.trim() ? Number(intakeYear) : null,
        academicYear,
        effectiveFrom: effectiveFrom || null,
        placements: normalizeSortOrder(placements),
      });
      setEditing(false);
      setMessage("Draft saved.");
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setMessage("This draft changed elsewhere. Reload the version before saving again.");
      } else {
        setMessage(error instanceof ApiError ? error.message : "Could not save curriculum draft");
      }
    } finally {
      setSaving(false);
    }
  };

  const createRevision = async () => {
    setSaving(true);
    setMessage(null);
    const input: CreateCurriculumRevisionInput = {
      revisionType,
      revisionTriggers: [revisionTrigger],
      revisionReason,
      changeSummary,
    };
    try {
      const created = await curriculumApi.createRevision(data.curriculum.id, version.id, input);
      setShowRevision(false);
      setRevisionReason("");
      setChangeSummary("");
      setMessage(`${revisionType} revision v${created.selectedVersion.version} created as Draft.`);
      onSaved(created);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not create curriculum revision");
    } finally {
      setSaving(false);
    }
  };

  if (!canWrite) return null;

  if (version.status === "Draft" && !editing) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Draft workspace</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This version can be edited. Approved and active versions remain immutable snapshots.
            </p>
          </div>
          <button type="button" onClick={() => void beginEdit()} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Edit draft
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
      </section>
    );
  }

  if (version.status === "Draft" && editing) {
    return (
      <section className="rounded-xl border border-amber-300 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Edit draft v{version.version}</h3>
            <p className="mt-1 text-sm text-muted-foreground">One save updates the complete draft snapshot atomically.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className="h-10 rounded-md border border-input px-4 text-sm font-medium">Cancel</button>
            <button type="button" disabled={saving} onClick={() => void saveDraft()} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? "Saving…" : "Save draft"}</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <label className="text-sm font-medium">Cohort label<input value={cohortLabel} onChange={(e) => setCohortLabel(e.target.value)} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3" /></label>
          <label className="text-sm font-medium">Intake year<input type="number" value={intakeYear} onChange={(e) => setIntakeYear(e.target.value)} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3" /></label>
          <label className="text-sm font-medium">Academic year<input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3" /></label>
          <label className="text-sm font-medium">Effective from<input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3" /></label>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Select course to add</option>
            {availableCourses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}
          </select>
          <button type="button" disabled={!selectedCourseId} onClick={addCourse} className="h-10 rounded-md border border-input px-4 text-sm font-medium disabled:opacity-50">Add course</button>
        </div>

        <div className="mt-4 space-y-2">
          {placements.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No courses in this draft yet.</p> : placements.map((placement, index) => (
            <div key={placement.courseId} className="grid gap-2 rounded-lg border border-border p-3 lg:grid-cols-[minmax(180px,1fr)_90px_110px_90px_150px_auto] lg:items-center">
              <div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">{placement.code}</p><p className="truncate text-sm font-medium">{placement.title}</p></div>
              <select aria-label={`Year for ${placement.code}`} value={placement.yearLevel} onChange={(e) => updatePlacement(placement.courseId, "yearLevel", Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">{[1,2,3,4].map((year) => <option key={year} value={year}>Year {year}</option>)}</select>
              <select aria-label={`Semester for ${placement.code}`} value={placement.semester} onChange={(e) => updatePlacement(placement.courseId, "semester", e.target.value as "First" | "Second")} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="First">Semester 1</option><option value="Second">Semester 2</option></select>
              <input aria-label={`Credits for ${placement.code}`} type="number" min={0} max={30} value={placement.credits} onChange={(e) => updatePlacement(placement.courseId, "credits", Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
              <select aria-label={`Course type for ${placement.code}`} value={placement.courseType} onChange={(e) => updatePlacement(placement.courseId, "courseType", e.target.value as CourseType)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">{COURSE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>
              <div className="flex gap-1 lg:justify-end"><button type="button" aria-label={`Move ${placement.code} up`} disabled={index === 0} onClick={() => movePlacement(placement.courseId, -1)} className="h-9 w-9 rounded-md border border-input disabled:opacity-40">↑</button><button type="button" aria-label={`Move ${placement.code} down`} disabled={index === placements.length - 1} onClick={() => movePlacement(placement.courseId, 1)} className="h-9 w-9 rounded-md border border-input disabled:opacity-40">↓</button><button type="button" onClick={() => setPlacements((current) => current.filter((item) => item.courseId !== placement.courseId))} className="h-9 rounded-md border border-destructive/30 px-2 text-xs font-medium text-destructive">Remove</button></div>
            </div>
          ))}
        </div>
        {message ? <p className="mt-4 text-sm text-muted-foreground">{message}</p> : null}
      </section>
    );
  }

  if (version.status === "Approved" || version.status === "Active") {
    if (!showRevision) {
      return (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold text-foreground">Need to change this curriculum?</h3><p className="mt-1 text-sm text-muted-foreground">Create a new draft revision. This {version.status.toLowerCase()} snapshot will not be changed.</p></div>
            <button type="button" onClick={() => setShowRevision(true)} className="h-10 rounded-md border border-input px-4 text-sm font-semibold">Create revision</button>
          </div>
          {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
        </section>
      );
    }

    return (
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-lg font-semibold">Create a new draft revision</h3>
        <p className="mt-1 text-sm text-muted-foreground">The new version receives a deep copy of this approved snapshot. Choose Major for substantial programme redesign; Minor for contained updates.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Revision type<select value={revisionType} onChange={(e) => setRevisionType(e.target.value as "Minor" | "Major")} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3"><option value="Minor">Minor revision</option><option value="Major">Major revision</option></select></label>
          <label className="text-sm font-medium">Trigger<select value={revisionTrigger} onChange={(e) => setRevisionTrigger(e.target.value as ProgrammeCurriculumRevisionTrigger)} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3">{PROGRAMME_CURRICULUM_REVISION_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{revisionTriggerLabel(trigger)}</option>)}</select></label>
          <label className="text-sm font-medium md:col-span-2">Reason for revision<textarea value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border border-input bg-background p-3" /></label>
          <label className="text-sm font-medium md:col-span-2">Change summary<textarea value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border border-input bg-background p-3" /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setShowRevision(false)} className="h-10 rounded-md border border-input px-4 text-sm font-medium">Cancel</button><button type="button" disabled={saving || !revisionReason.trim() || !changeSummary.trim()} onClick={() => void createRevision()} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Creating…" : `Create ${revisionType.toLowerCase()} revision`}</button></div>
        {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
      </section>
    );
  }

  return null;
}
