import { Topbar } from "../topbar";
import { QaResearchPilotClient } from "./qa-research-pilot-client";

export default function QaResearchPilotPage() {
  return (
    <>
      <Topbar
        title="AUN-QA Evidence-Gap Research Pilot"
        subtitle="Controlled Criteria 1–5 scenarios with independent expert reference labels and traceable prototype runs"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <QaResearchPilotClient />
      </main>
    </>
  );
}
