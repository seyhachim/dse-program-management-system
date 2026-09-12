import Link from "next/link";
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
        <div className="mb-4 flex justify-end">
          <Link
            href="/teaching-schedule/open-slots"
            className="inline-flex min-h-10 items-center rounded-xl border bg-background px-3 text-sm font-semibold shadow-sm transition hover:bg-muted"
          >
            Open Teaching Slots
          </Link>
        </div>
        <TeachingLeaveRequestsClient />
      </main>
    </>
  );
}
