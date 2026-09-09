import Link from "next/link";
import { Topbar } from "../topbar";
import { ProgrammeManagementClient } from "./programme-management-client";

export default function ProgrammeManagementPage() {
  return (
    <>
      <Topbar
        title="Programme Management"
        subtitle="Programme profile, learning outcomes, competencies, policies, teaching vocabulary, and delivery channels"
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-semibold text-foreground">Teaching & Learning Vocabulary</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage programme-approved teaching methods, active learning clusters, and strategies used by lecturers.
                </p>
              </div>
              <Link href="/programme-management/teaching-learning" className="mt-auto inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                Manage Vocabulary
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex h-full flex-col gap-4">
              <div>
                <h2 className="font-semibold text-foreground">Student Progression</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review a cohort and record auditable Year 1→2→3→4 progression decisions with student-level exceptions.
                </p>
              </div>
              <Link href="/students/cohorts" className="mt-auto inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                Manage Progression
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex h-full flex-col gap-4">
              <div>
                <h2 className="font-semibold text-foreground">Teaching Leave Review</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review exact-session lecturer teaching leave requests and keep decisions auditable before schedule-impact notifications are sent.
                </p>
              </div>
              <Link href="/programme-management/teaching-leave" className="mt-auto inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                Review Teaching Leave
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex h-full flex-col gap-4">
              <div>
                <h2 className="font-semibold text-foreground">Telegram Destinations</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect lecturer, student, cohort, class, and operational Telegram groups without hard-coded chat IDs.
                </p>
              </div>
              <Link href="/programme-management/telegram-destinations" className="mt-auto inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                Manage Destinations
              </Link>
            </div>
          </div>
        </div>

        <ProgrammeManagementClient />
      </main>
    </>
  );
}
