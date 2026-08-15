import { Topbar } from "../topbar";
import { CommunityHubClient } from "./community-hub-client";

export default function CommunityPage() {
  return (
    <>
      <Topbar title="Community of Practice" subtitle="Students and staff learning together" />
      <main className="flex-1 overflow-y-auto">
        <CommunityHubClient />
      </main>
    </>
  );
}
