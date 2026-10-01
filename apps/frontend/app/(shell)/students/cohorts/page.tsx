import { Topbar } from "../../topbar";
import { CohortMembershipClient } from "./cohort-membership-client";
import { CohortPromotionClient } from "./cohort-promotion-client";
import { CohortRosterSyncClient } from "./cohort-roster-sync-client";
import { CohortSectionClient } from "./cohort-section-client";

export default function StudentCohortsPage() {
  return (
    <>
      <Topbar
        title="Student Cohorts"
        subtitle="Manage verified cohort/section membership and programme-year progression without rewriting academic history"
      />
      <main className="flex-1 space-y-6 overflow-y-auto p-6">
        <CohortMembershipClient />
        <CohortSectionClient />
        <CohortRosterSyncClient />
        <CohortPromotionClient />
      </main>
    </>
  );
}