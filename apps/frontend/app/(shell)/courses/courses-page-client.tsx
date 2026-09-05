"use client";

import { Topbar } from "../topbar";
import { useMe } from "@/lib/auth";
import { CoursesClient } from "./courses-client";
import { MyCoursesClient } from "./my-courses-client";

/**
 * Programme-wide roles keep the shared courses/specification catalogue view —
 * mirrors the backend's PROGRAMME_WIDE_ROLES (apps/backend/src/core/auth/token.ts),
 * duplicated here since the frontend has no import path to that backend module.
 * Anyone else holding "lecturer" gets the focused "Course Specifications" view;
 * a caller with neither (e.g. a not-yet-resolved session) falls back to the
 * programme-wide view while `me` loads.
 */
const PROGRAMME_WIDE_ROLES = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "qa_reviewer",
];

export function CoursesPageClient() {
  const { me } = useMe();
  const isLecturerOnly =
    me != null &&
    me.roles.includes("lecturer") &&
    !me.roles.some((role) => PROGRAMME_WIDE_ROLES.includes(role));

  if (isLecturerOnly) {
    return (
      <>
        <Topbar
          title="Course Specifications"
          subtitle="Specification status, completeness, and follow-up for the courses you teach or are responsible for."
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
            <span className="font-medium text-foreground">
              Your Course Specifications
            </span>
            <span className="text-muted-foreground">
              Courses appear when you are a Responsible Lecturer or are assigned
              to teach a class section. A Course Spec can be prepared before
              sections are created.
            </span>
          </div>
          <MyCoursesClient />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Courses & Specifications"
        subtitle="Course records, specifications, and responsible lecturers."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <CoursesClient />
      </main>
    </>
  );
}
