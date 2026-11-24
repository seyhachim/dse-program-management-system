import { Topbar } from "../../../../topbar";
import { ParticipantsClient } from "./participants-client";

export default async function VisitParticipantsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ activityId?: string }>;
}) {
  const [{ id }, { activityId }] = await Promise.all([params, searchParams]);
  return (
    <>
      <Topbar title="Study Visit Participants" subtitle="Private trip sign-in records; separate from class attendance" />
      <main className="flex-1 overflow-y-auto p-6">
        <ParticipantsClient offeringId={id} activityId={activityId ?? ""} />
      </main>
    </>
  );
}
