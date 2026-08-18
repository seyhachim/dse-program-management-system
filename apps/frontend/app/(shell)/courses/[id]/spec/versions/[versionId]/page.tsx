import { Topbar } from "../../../../../topbar";
import { HistoricalVersionClient } from "./historical-version-client";

export default async function HistoricalCourseSpecPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  return (
    <>
      <Topbar title="Historical Course Specification" subtitle="Read-only exact academic version" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl">
          <HistoricalVersionClient courseId={id} versionId={versionId} />
        </div>
      </main>
    </>
  );
}
