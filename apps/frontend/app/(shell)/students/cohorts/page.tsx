import { Topbar } from "../../topbar";
import { CohortPromotionClient } from "./cohort-promotion-client";

export default function StudentCohortsPage() {
  return (
    <>
      <Topbar
        title="Student Cohorts"
        subtitle="Review programme-year progression and promote eligible students without rewriting cohort history"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <CohortPromotionClient />
      </main>
    </>
  );
}
