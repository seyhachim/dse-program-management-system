import { Topbar } from "../../topbar";
import { TeachingLeaveRequestsClient } from "./teaching-leave-requests-client";

export default function TeachingLeaveRequestsPage() {
  return (
    <>
      <Topbar
        title="My Teaching Leave Requests"
        subtitle="Track exact-session requests, reviewer guidance, and resubmit requested changes without altering the original session scope"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <TeachingLeaveRequestsClient />
      </main>
    </>
  );
}
