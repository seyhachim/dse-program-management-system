import Link from "next/link";
import { buttonVariants } from "@dse-pms/ui";
import { Topbar } from "../../topbar";
import { AcademicCalendarJsonImportClient } from "../academic-calendar-json-import-client";
import { AcademicCalendarProgrammeHolidays } from "../academic-calendar-programme-holidays";

export default function ProgrammeHolidaysPage() {
  return (
    <>
      <Topbar
        title="Programme Holidays"
        subtitle="Import, review, edit, and publish programme-wide official holidays"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="space-y-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Holiday workflow</p>
              <p className="mt-1 text-muted-foreground">
                Review the current correction draft, add/edit/remove pending holidays, then publish once. The importer here accepts holiday-only JSON ("calendars": []).
              </p>
            </div>
            <Link className={buttonVariants({ variant: "outline" })} href="/academic-calendar/import">
              Import full calendar JSON
            </Link>
          </div>
          <AcademicCalendarProgrammeHolidays />
          <AcademicCalendarJsonImportClient mode="holidays" />
        </div>
      </main>
    </>
  );
}
