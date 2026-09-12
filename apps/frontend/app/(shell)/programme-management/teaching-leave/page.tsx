import Link from "next/link";
import { Topbar } from "../../topbar";
import { TeachingLeaveReviewClient } from "./teaching-leave-review-client";

export default function TeachingLeaveReviewPage() {
  return (
    <>
      <Topbar
        title="Teaching Leave Review"
        subtitle="Review session-scoped lecturer teaching availability requests without exposing confidential details outside PMS"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex justify-end">
          <Link
            href="/programme-management/open-teaching-slots"
            className="inline-flex min-h-10 items-center rounded-xl border bg-background px-3 text-sm font-semibold shadow-sm transition hover:bg-muted"
          >
            Open Slot Claims
          </Link>
        </div>
        <TeachingLeaveReviewClient />
      </main>
    </>
  );
}
