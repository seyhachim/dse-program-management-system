import { CommunityDiscussionClient } from "./community-discussion-client";

export default async function CommunityDiscussionPage({
  params,
}: {
  params: Promise<{ communityId: string; discussionId: string }>;
}) {
  const { communityId, discussionId } = await params;
  return <CommunityDiscussionClient communityId={communityId} discussionId={discussionId} />;
}
