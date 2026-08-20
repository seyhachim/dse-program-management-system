import { Topbar } from "../../topbar";
import { RatingScalesClient } from "./rating-scales-client";

export default function RatingScalesPage() {
  return (
    <>
      <Topbar
        title="Rating Scales"
        subtitle="Manage programme grading policy, approvals, and version history"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <RatingScalesClient />
      </main>
    </>
  );
}
