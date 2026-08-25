import Link from "next/link";
import { Topbar } from "../topbar";
import { AunQaSectionNav } from "../aun-qa/aun-qa-section-nav";
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
        <AunQaSectionNav />
        <div className="mb-4 flex justify-end">
          <Link
            href="/qa-research"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            Open research pilot
          </Link>
        </div>
        <QaContributorManagement />
        <QaDashboardClient />
      </main>
    </>
  );
}
