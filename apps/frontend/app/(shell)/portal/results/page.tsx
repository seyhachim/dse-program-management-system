import { Topbar } from "../../topbar";
import { PortalResults } from "./portal-results";

export default function PortalResultsPage() {
  return (
    <>
      <Topbar
        title="Results"
        subtitle="Published assessment results and CLO achievement"
      />
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <PortalResults />
      </main>
    </>
  );
}
