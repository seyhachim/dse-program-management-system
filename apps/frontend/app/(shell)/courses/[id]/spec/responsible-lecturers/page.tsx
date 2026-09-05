import { Topbar } from "../../../../topbar";
import { ResponsibleLecturersClient } from "./responsible-lecturers-client";

export default async function ResponsibleLecturersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Topbar
        title="Manage Course Team"
        subtitle="Assign the Responsible Lecturer and Co-Lecturers, or use shared responsibility."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <ResponsibleLecturersClient courseId={id} />
      </main>
    </>
  );
}
