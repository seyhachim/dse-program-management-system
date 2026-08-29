import { Topbar } from "../../topbar";
import { ActionResearchClient } from "./action-research-client";

export default function ActionResearchPage() {
  return (
    <>
      <Topbar
        title="Action Research"
        subtitle="Assign programme improvement problems, run evidence-based cycles, and review research protocols"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <ActionResearchClient />
      </main>
    </>
  );
}
