import { Topbar } from "../topbar";
import { CurriculumHistoryPanel } from "./curriculum-history-panel";
import { CurriculumPageClient } from "./curriculum-page-client";
import { CurriculumWorkflowActions } from "./curriculum-workflow-actions";

export default function CurriculumPage() {
  return (
    <>
      <Topbar
        title="Programme Curriculum"
        subtitle="View, compare, review, approve, and manage the complete DSE curriculum by version."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <CurriculumWorkflowActions />
        <CurriculumHistoryPanel />
        <CurriculumPageClient />
      </main>
    </>
  );
}
