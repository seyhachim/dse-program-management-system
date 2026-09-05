import { Suspense } from "react";
import { Topbar } from "../../../topbar";
import { CourseSpecClientGateway } from "./course-spec-client-gateway";
import { VersionHistoryBar } from "./version-history-bar";

export default async function CourseSpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Topbar
        title="Course Specification"
        subtitle="Complete the academic specification — save each section, continue later"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <VersionHistoryBar courseId={id} />
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <CourseSpecClientGateway courseId={id} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
