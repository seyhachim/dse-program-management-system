"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CourseSpecResponsibleLecturersView,
  Lecturer,
} from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { lecturersApi } from "@/lib/lecturers";

const EDITABLE = new Set(["Draft", "ChangesRequested"]);

export function ResponsibleLecturersClient({ courseId }: { courseId: string }) {
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [view, setView] = useState<CourseSpecResponsibleLecturersView | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load responsible lecturers",
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

  const toggle = (id: string) => {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
        { lecturerIds: [...selected] },
      );
      setView(next);
      setSelected(new Set(next.lecturers.map((lecturer) => lecturer.id)));
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save responsible lecturers",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

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
              Course Spec v{view?.academicVersion ?? "1.0"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every selected lecturer has the same responsibility: edit Draft or
              Changes Requested, submit, and resubmit. Approval remains with the
              Head of Program review role.
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {view?.reviewStatus ?? "Draft"}
          </span>
        </div>

        {!editable ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Responsible lecturers are locked while this version is in review or
            approved. Create a revision to change the team.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Responsible lecturers saved.
          </p>
        ) : null}

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
          {filteredLecturers.map((lecturer) => (
            <label
              key={lecturer.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"
            >
              <input
                type="checkbox"
                checked={selected.has(lecturer.id)}
                disabled={!editable}
                onChange={() => toggle(lecturer.id)}
                className="h-4 w-4"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{lecturer.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {lecturer.email}
                </span>
              </span>
            </label>
          ))}
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
          <div className="mt-3 flex justify-end">
            <Button onClick={save} disabled={!editable || saving}>
              {saving ? "Saving…" : "Save Responsible Lecturers"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
