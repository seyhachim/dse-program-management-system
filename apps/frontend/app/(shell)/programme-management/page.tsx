import Link from "next/link";
import { Topbar } from "../topbar";
import { ProgrammeManagementClient } from "./programme-management-client";

export default function ProgrammeManagementPage() {
  return (
    <>
      <Topbar
        title="Programme Management"
        subtitle="Programme profile, learning outcomes, competencies, policies, and teaching vocabulary"
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Teaching & Learning Vocabulary</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage programme-approved teaching methods, active learning clusters, and strategies used by lecturers.
                </p>
              </div>
              <Link
                href="/programme-management/teaching-learning"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Manage Vocabulary
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Student Progression</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review a cohort and record auditable Year 1→2→3→4 progression decisions with student-level exceptions.
                </p>
              </div>
              <Link
                href="/students/cohorts"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Manage Progression
              </Link>
            </div>
          </div>
        </div>

        <ProgrammeManagementClient />
      </main>
    </>
  );
}
