import { CommunityDetailClient } from "./community-detail-client";

export default async function CommunityDetailPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  return <CommunityDetailClient communityId={communityId} />;
}
