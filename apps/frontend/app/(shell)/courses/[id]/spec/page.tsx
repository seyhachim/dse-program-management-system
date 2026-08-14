import { Suspense } from "react";
import { Topbar } from "../../../topbar";
import { SpecClient } from "./spec-client";

export default async function CourseSpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Topbar title="Course Specification" subtitle="Fill the full syllabus — save each section, continue later" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense fallback={<p className="mx-auto max-w-7xl text-sm text-muted-foreground">Loading…</p>}>
          <SpecClient courseId={id} />
        </Suspense>
      </main>
    </>
  );
}
