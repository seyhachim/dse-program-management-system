import { Topbar } from "../../topbar";
import { ManageOpportunitiesClient } from "./manage-opportunities-client";

export default function ManageOpportunitiesPage() {
  return (
    <>
      <Topbar title="Manage opportunities" subtitle="Manual verification and publication — no automatic external publishing" />
      <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <ManageOpportunitiesClient />
      </main>
    </>
  );
}
