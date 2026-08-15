import { Topbar } from "../../../../topbar";
import { CommunityDiscussionClient } from "./community-discussion-client";

export default async function CommunityDiscussionPage({
  params,
}: {
  params: Promise<{ communityId: string; discussionId: string }>;
}) {
  const { communityId, discussionId } = await params;
  return (
    <>
      <Topbar title="Community Discussion" subtitle="From shared experience to measurable action" />
      <main className="flex-1 overflow-y-auto">
        <CommunityDiscussionClient communityId={communityId} discussionId={discussionId} />
      </main>
    </>
  );
}
