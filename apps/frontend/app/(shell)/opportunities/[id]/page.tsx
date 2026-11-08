import { Topbar } from "../../topbar";
import { OpportunityDetailClient } from "./opportunity-detail-client";

export default function OpportunityDetailPage() {
  return (
    <>
      <Topbar title="Opportunity details" subtitle="Verified source information and DSE student experiences" />
      <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <OpportunityDetailClient />
      </main>
    </>
  );
}
