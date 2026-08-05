"use client";

import { Topbar } from "../topbar";
import { useMe } from "@/lib/auth";
import { CoursesClient } from "./courses-client";
import { MyCoursesClient } from "./my-courses-client";

/**
 * Programme-wide roles that keep the curriculum-management "Course Management"
 * view — mirrors the backend's PROGRAMME_WIDE_ROLES (apps/backend/src/core/auth/token.ts),
 * duplicated here since the frontend has no import path to that backend module.
 * Anyone else holding "lecturer" gets the teaching-focused "My Courses" view
 * (issue #104); a caller with neither (e.g. a not-yet-resolved session) falls
 * back to the admin view while `me` loads.
 */
const PROGRAMME_WIDE_ROLES = ["admin", "program_coordinator", "program_secretary", "qa_reviewer"];

export function CoursesPageClient() {
  const { me } = useMe();
  const isLecturerOnly = me != null && me.roles.includes("lecturer") && !me.roles.some((r) => PROGRAMME_WIDE_ROLES.includes(r));

  if (isLecturerOnly) {
    return (
      <>
        <Topbar title="My Courses" subtitle="Courses you teach and their current academic status." />
        <main className="flex-1 overflow-y-auto p-6">
          <MyCoursesClient />
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
