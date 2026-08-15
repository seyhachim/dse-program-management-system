"use client";

import { Topbar } from "../topbar";
import { useMe } from "@/lib/auth";
import { CoursesClient } from "./courses-client";
import { MyCoursesClient } from "./my-courses-client";
import { TeachingRoleBadge } from "./teaching-role-badge";

/**
 * Programme-wide roles that keep the curriculum-management "Course Management"
 * view — mirrors the backend's PROGRAMME_WIDE_ROLES (apps/backend/src/core/auth/token.ts),
 * duplicated here since the frontend has no import path to that backend module.
 * Anyone else holding "lecturer" gets the focused "Course Specifications" view;
 * a caller with neither (e.g. a not-yet-resolved session) falls back to the
 * programme-wide view while `me` loads.
 */
const PROGRAMME_WIDE_ROLES = ["admin", "program_coordinator", "program_secretary", "qa_reviewer"];

export function CoursesPageClient() {
  const { me } = useMe();
  const isLecturerOnly = me != null && me.roles.includes("lecturer") && !me.roles.some((r) => PROGRAMME_WIDE_ROLES.includes(r));

  if (isLecturerOnly) {
    return (
      <>
        <Topbar
          title="Course Specifications"
          subtitle="Specification status, completeness, and follow-up for the courses you teach."
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
            <span className="font-medium text-foreground">Your teaching role:</span>
            <TeachingRoleBadge role="Primary" />
            <TeachingRoleBadge role="Co-Lecturer" />
            <span className="text-muted-foreground">
              The Role column shows how you are assigned to each course offering.
            </span>
          </div>
          <div className="[&>div>section]:hidden">
            <MyCoursesClient />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Course Management" subtitle="Courses — CRUD, list, syllabus" />
      <main className="flex-1 overflow-y-auto p-6">
        <CoursesClient />
      </main>
    </>
  );
}
