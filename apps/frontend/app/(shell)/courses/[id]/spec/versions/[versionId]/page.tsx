import { Topbar } from "../../../../../topbar";
import { HistoricalVersionClient } from "./historical-version-client";

export default async function HistoricalCourseSpecPage({ params, searchParams }: { params: Promise<{ id: string; versionId: string }>; searchParams: Promise<{ curriculumVersionId?: string | string[]; placementId?: string | string[] }> }) {
  const { id, versionId } = await params;
  const query = await searchParams;
  const context = query.curriculumVersionId !== undefined || query.placementId !== undefined
    ? { curriculumVersionId: typeof query.curriculumVersionId === "string" ? query.curriculumVersionId : "", placementId: typeof query.placementId === "string" ? query.placementId : "" }
    : undefined;
  return (
    <>
      <Topbar title="Historical Course Specification" subtitle="Read-only exact academic version" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl">
          <HistoricalVersionClient key={`${id}:${versionId}:${context?.curriculumVersionId ?? ""}:${context?.placementId ?? ""}`} courseId={id} versionId={versionId} curriculumContext={context} />
        </div>
      </main>
    </>
  );
}
