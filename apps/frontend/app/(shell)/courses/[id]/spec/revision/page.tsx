import { Topbar } from "../../../../topbar";
import { RevisionRequestClient } from "./revision-request-client";

export default async function CourseSpecRevisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Topbar
        title="Course Specification Revision"
        subtitle="Assess impact and create the next academic revision"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <RevisionRequestClient courseId={id} />
      </main>
    </>
  );
}
