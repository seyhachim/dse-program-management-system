"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CourseSpecResponsibilityMode,
  CourseSpecResponsibleLecturersView,
  Lecturer,
} from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { lecturersApi } from "@/lib/lecturers";

const EDITABLE = new Set(["Draft", "ChangesRequested"]);
const FINAL_PROJECT_CODES = new Set(["FPR401", "FPR402"]);

export function ResponsibleLecturersClient({ courseId }: { courseId: string }) {
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [view, setView] = useState<CourseSpecResponsibleLecturersView | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [responsibilityMode, setResponsibilityMode] =
    useState<CourseSpecResponsibilityMode>("LEAD_AND_CO");
  const [leadLecturerId, setLeadLecturerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      lecturersApi.list(),
      api.get<CourseSpecResponsibleLecturersView>(
        `/api/courses/${courseId}/spec/responsible-lecturers`,
      ),
    ])
      .then(([lecturerList, assignment]) => {
        if (cancelled) return;
        setLecturers(lecturerList);
        setView(assignment);
        setSelected(new Set(assignment.lecturers.map((lecturer) => lecturer.id)));
        setResponsibilityMode(assignment.responsibilityMode);
        setLeadLecturerId(assignment.leadLecturerId);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load Course Team",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const editable = !view || EDITABLE.has(view.reviewStatus);
  const sharedOnly = view ? FINAL_PROJECT_CODES.has(view.courseCode.toUpperCase()) : false;
  const selectedNames = useMemo(
    () =>
      lecturers
        .filter((lecturer) => selected.has(lecturer.id))
        .map((lecturer) => lecturer.name),
    [lecturers, selected],
  );
  const filteredLecturers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return lecturers;

    return lecturers.filter(
      (lecturer) =>
        lecturer.name.toLowerCase().includes(query) ||
        lecturer.email.toLowerCase().includes(query),
    );
  }, [lecturers, search]);

  const chooseMode = (mode: CourseSpecResponsibilityMode) => {
    if (!editable || (sharedOnly && mode !== "SHARED")) return;
    setSaved(false);
    setResponsibilityMode(mode);
    if (mode === "SHARED") {
      setLeadLecturerId(null);
    } else if (!leadLecturerId || !selected.has(leadLecturerId)) {
      setLeadLecturerId([...selected][0] ?? null);
    }
  };

  const toggle = (id: string) => {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        if (leadLecturerId === id) {
          setLeadLecturerId(
            responsibilityMode === "LEAD_AND_CO" ? ([...next][0] ?? null) : null,
          );
        }
      } else {
        next.add(id);
        if (responsibilityMode === "LEAD_AND_CO" && !leadLecturerId) {
          setLeadLecturerId(id);
        }
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await api.put<CourseSpecResponsibleLecturersView>(
        `/api/courses/${courseId}/spec/responsible-lecturers`,
        {
          lecturerIds: [...selected],
          responsibilityMode,
          leadLecturerId:
            responsibilityMode === "LEAD_AND_CO" ? leadLecturerId : null,
        },
      );
      setView(next);
      setSelected(new Set(next.lecturers.map((lecturer) => lecturer.id)));
      setResponsibilityMode(next.responsibilityMode);
      setLeadLecturerId(next.leadLecturerId);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save Course Team",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const missingLead =
    responsibilityMode === "LEAD_AND_CO" && selected.size > 0 && !leadLecturerId;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/courses" />}
        >
          Back to Courses
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/courses/${courseId}/spec`} />}
        >
          Open Course Specification
        </Button>
      </div>

      <section className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {view?.courseCode ? `${view.courseCode} · ` : ""}Course Spec v
              {view?.academicVersion ?? "1.0"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Course Team roles describe responsibility for this shared Course
              Specification. Final-project supervision is managed separately.
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {view?.reviewStatus ?? "Draft"}
          </span>
        </div>

        {!editable ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            The Course Team is locked while this version is in review or approved.
            Create a revision to change the team.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Course Team saved.
          </p>
        ) : null}

        <div className="mt-5">
          <p className="text-sm font-medium">Responsibility model</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!editable || sharedOnly}
              onClick={() => chooseMode("LEAD_AND_CO")}
              className={`rounded-lg border p-3 text-left transition ${
                responsibilityMode === "LEAD_AND_CO"
                  ? "border-primary bg-primary/5"
                  : "border-border"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="block text-sm font-medium">Lead + Co-Lecturers</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                One Responsible Lecturer leads the shared specification; other
                selected lecturers are Co-Lecturers.
              </span>
            </button>
            <button
              type="button"
              disabled={!editable}
              onClick={() => chooseMode("SHARED")}
              className={`rounded-lg border p-3 text-left transition ${
                responsibilityMode === "SHARED"
                  ? "border-primary bg-primary/5"
                  : "border-border"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="block text-sm font-medium">Shared Responsibility</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Every selected lecturer has equal Course Specification responsibility.
              </span>
            </button>
          </div>
          {sharedOnly ? (
            <p className="mt-2 text-xs font-medium text-primary">
              {view?.courseCode} is configured for shared responsibility; all Course
              Team members are equal.
            </p>
          ) : null}
        </div>

        {lecturers.length > 0 ? (
          <div className="mt-5 space-y-2">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search lecturers by name or email"
              aria-label="Search lecturers by name or email"
            />
            <p className="text-xs text-muted-foreground">
              Showing {filteredLecturers.length} of {lecturers.length} lecturers
            </p>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {filteredLecturers.map((lecturer) => {
            const isSelected = selected.has(lecturer.id);
            const isLead =
              responsibilityMode === "LEAD_AND_CO" &&
              leadLecturerId === lecturer.id;
            return (
              <div
                key={lecturer.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!editable}
                  onChange={() => toggle(lecturer.id)}
                  aria-label={`Add ${lecturer.name} to Course Team`}
                  className="h-4 w-4"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{lecturer.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {lecturer.email}
                  </span>
                </span>
                {isSelected && responsibilityMode === "LEAD_AND_CO" ? (
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <input
                      type="radio"
                      name="responsible-lecturer"
                      checked={isLead}
                      disabled={!editable}
                      onChange={() => {
                        setSaved(false);
                        setLeadLecturerId(lecturer.id);
                      }}
                      className="h-4 w-4"
                    />
                    Responsible
                  </label>
                ) : isSelected ? (
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    Shared
                  </span>
                ) : null}
              </div>
            );
          })}
          {lecturers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No lecturers are available to assign.
            </p>
          ) : filteredLecturers.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
              No lecturers match “{search.trim()}”.
            </p>
          ) : null}
        </div>

        <div className="mt-5 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Selected: {selectedNames.length ? selectedNames.join(", ") : "None"}
          </p>
          {missingLead ? (
            <p className="mt-1 text-xs font-medium text-destructive">
              Choose one selected lecturer as the Responsible Lecturer.
            </p>
          ) : null}
          <div className="mt-3 flex justify-end">
            <Button onClick={save} disabled={!editable || saving || missingLead}>
              {saving ? "Saving…" : "Save Course Team"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
