import { Topbar } from "../topbar";
import { AunQaSectionNav } from "./aun-qa-section-nav";
import { AunQaWorkspaceClient } from "./workspace-client";

export default function AunQaWorkspacePage() {
  return (
    <>
      <Topbar
        title="AUN-QA Workspace"
        subtitle="Assign requirements, collect evidence, and prepare evidence-grounded SAR work"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <AunQaSectionNav />
        <AunQaWorkspaceClient />
      </main>
    </>
  );
}
