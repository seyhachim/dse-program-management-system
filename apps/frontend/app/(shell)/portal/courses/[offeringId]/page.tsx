import { Topbar } from "../../../topbar";
import { PortalCourse } from "./portal-course";

export default async function PortalCoursePage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const { offeringId } = await params;
  return (
    <>
      <Topbar
        title="Course"
        subtitle="Approved learning information for your class"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-7 lg:p-8">
        <PortalCourse offeringId={offeringId} />
      </main>
    </>
  );
}
