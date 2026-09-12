import { Topbar } from "../../topbar";
import { OpenTeachingSlotReviewClient } from "./open-teaching-slot-review-client";

export default function OpenTeachingSlotReviewPage() {
  return (
    <>
      <Topbar
        title="Open Teaching Slot Review"
        subtitle="Approve or reject requests to reuse released class time without changing the original missed session"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <OpenTeachingSlotReviewClient />
      </main>
    </>
  );
}
