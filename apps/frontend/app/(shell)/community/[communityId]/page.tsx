import { Topbar } from "../../topbar";
import { CommunityDetailClient } from "./community-detail-client";

export default async function CommunityDetailPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  return (
    <>
      <Topbar title="Community of Practice" subtitle="Community workspace" />
      <main className="flex-1 overflow-y-auto">
        <CommunityDetailClient communityId={communityId} />
      </main>
    </>
  );
}
