import Link from "next/link";
import { buttonVariants } from "@dse-pms/ui";
import { Topbar } from "../../topbar";
import { AcademicCalendarJsonImportClient } from "../academic-calendar-json-import-client";

export default function AcademicCalendarImportPage() {
  return (
    <>
      <Topbar
        title="Import Academic Calendar JSON"
        subtitle="Validate and preview structured calendar data before creating drafts"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="space-y-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Full calendar import</p>
              <p className="mt-1 text-muted-foreground">
                Use this page for JSON that includes Year 1–4 semester periods. For holiday-only JSON, use Programme Holidays instead.
              </p>
            </div>
            <Link className={buttonVariants({ variant: "outline" })} href="/academic-calendar/holidays">
              Go to Programme Holidays
            </Link>
          </div>
          <AcademicCalendarJsonImportClient />
        </div>
      </main>
    </>
  );
}
