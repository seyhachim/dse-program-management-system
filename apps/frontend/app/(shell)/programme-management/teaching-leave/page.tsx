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
        <TeachingLeaveReviewClient />
      </main>
    </>
  );
}
