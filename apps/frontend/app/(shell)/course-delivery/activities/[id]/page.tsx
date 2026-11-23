import { Topbar } from "../../../topbar";
import { ActivitiesClient } from "../../../offerings/[id]/activities/activities-client";

export default async function CourseDeliveryActivitiesPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Topbar title="Course Activities" subtitle="Field visits, workshops, and teaching evidence" />
      <main className="flex-1 overflow-y-auto p-6">
        <ActivitiesClient offeringId={id} backHref="/course-delivery" backLabel="Course Delivery" />
      </main>
    </>
  );
}
