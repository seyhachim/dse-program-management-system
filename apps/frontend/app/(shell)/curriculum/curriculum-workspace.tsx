"use client";

import { useState } from "react";
import { CurriculumCourseSpecBindingsPanel } from "./curriculum-course-spec-bindings-panel";
import { CurriculumHistoryPanel } from "./curriculum-history-panel";
import { CurriculumImportExportPanel } from "./curriculum-import-export-panel";
import { CurriculumPageClient } from "./curriculum-page-client";
import {
  CURRICULUM_WORKSPACE_TABS,
  type CurriculumWorkspaceTab,
} from "./curriculum-view-state";
import { CurriculumWorkflowActions } from "./curriculum-workflow-actions";

const TAB_LABELS: Record<CurriculumWorkspaceTab, string> = {
  "study-plan": "Study Plan",
  "structure-mapping": "Structure & Mapping",
  "versions-revisions": "Versions & Revisions",
  "import-export": "Import / Export",
};

export function CurriculumWorkspace() {
  const [activeTab, setActiveTab] = useState<CurriculumWorkspaceTab>("study-plan");

  return (
    <div className="space-y-6">
      <nav
        aria-label="Curriculum sections"
        className="overflow-x-auto rounded-xl border bg-card p-1"
      >
        <div className="flex min-w-max gap-1">
          {CURRICULUM_WORKSPACE_TABS.map((tab) => {
            const selected = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>
      </nav>

      <section role="tabpanel">
        {activeTab === "study-plan" && <CurriculumPageClient />}
        {activeTab === "structure-mapping" && <CurriculumCourseSpecBindingsPanel />}
        {activeTab === "versions-revisions" && (
          <div className="space-y-6">
            <CurriculumWorkflowActions />
            <CurriculumHistoryPanel />
          </div>
        )}
        {activeTab === "import-export" && <CurriculumImportExportPanel />}
      </section>
    </div>
  );
}
