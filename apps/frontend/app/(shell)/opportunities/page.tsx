import { Topbar } from "../topbar";
import { OpportunitiesClient } from "./opportunities-client";

export default function OpportunitiesPage() {
  return (
    <>
      <Topbar title="Opportunities" subtitle="Verified opportunities from DSE programme staff" />
      <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <OpportunitiesClient />
      </main>
    </>
  );
}
