import { Topbar } from "../../../topbar";
import { ActivitiesClient } from "./activities-client";

export default async function OfferingActivitiesPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Topbar title="Course Activities" subtitle="Field visits, industry learning, and teaching evidence" />
      <main className="flex-1 overflow-y-auto p-6">
        <ActivitiesClient offeringId={id} />
      </main>
    </>
  );
}
