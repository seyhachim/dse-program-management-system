"use client";

import { useEffect, useMemo, useState } from "react";
import { semesterLabel, type OfferingView } from "@dse-pms/shared-types";
import { offeringsApi } from "@/lib/offerings";
import { useMe } from "@/lib/auth";
import { TeachingRoleBadge } from "./teaching-role-badge";

export function CourseTeachingAssignment({ courseId }: { courseId: string }) {
  const { me } = useMe();
  const [offerings, setOfferings] = useState<OfferingView[]>([]);

  useEffect(() => {
    let cancelled = false;
    offeringsApi
      .list()
      .then((items) => {
        if (!cancelled) setOfferings(items);
      })
      .catch(() => {
        if (!cancelled) setOfferings([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const courseOfferings = useMemo(
    () =>
      offerings
        .filter((item) => item.course?.id === courseId)
        .sort(
          (a, b) =>
            b.term.localeCompare(a.term) || a.sectionCode.localeCompare(b.sectionCode),
        ),
    [courseId, offerings],
  );

  if (!me || courseOfferings.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-foreground">Teaching Assignments</p>
      <div className="space-y-3">
        {courseOfferings.map((offering) => {
          const isPrimary = offering.lecturer?.id === me.id;
          const isCoLecturer = offering.coLecturers.some((lecturer) => lecturer.id === me.id);
          const role = isPrimary ? "Primary" : isCoLecturer ? "Co-Lecturer" : null;
          const coLecturerNames = offering.coLecturers.map((lecturer) => lecturer.name).filter(Boolean);
          return (
            <div key={offering.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">Class {offering.sectionCode}</p>
                  {role ? <TeachingRoleBadge role={role} /> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {offering.term}
                  {offering.programmeYear != null ? ` · Year ${offering.programmeYear}` : ""}
                  {offering.semester ? ` · ${semesterLabel(offering.semester)}` : ""}
                </p>
              </div>
              <div className="grid min-w-0 gap-2 text-sm sm:grid-cols-2 sm:gap-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Primary Lecturer</p>
                  <p className="mt-0.5 font-medium text-foreground">{offering.lecturer?.name || "Not assigned"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Co-Lecturer(s)</p>
                  <p className="mt-0.5 text-foreground">{coLecturerNames.length ? coLecturerNames.join(", ") : "None assigned"}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
