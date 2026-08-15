import { Topbar } from "../topbar";
import { QaContributorManagement } from "./qa-contributor-management";
import { QaDashboardClient } from "./qa-dashboard-client";

export default function QaDashboardPage() {
  return (
    <>
      <Topbar
        title="AUN-QA Readiness"
        subtitle="Programme evidence and human-reviewed self-assessment against AUN-QA v4"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <QaContributorManagement />
        <QaDashboardClient />
      </main>
    </>
  );
}
