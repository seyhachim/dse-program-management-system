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
          <div className="mx-auto max-w-7xl rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
            <p className="font-medium">Holiday workflow</p>
            <p className="mt-1 text-muted-foreground">
              Upload holiday-only JSON or add holidays manually. Imported holidays stay in the current correction draft so you can edit or remove them before publishing. Official published holidays remain unchanged until you publish the correction.
            </p>
          </div>
          <AcademicCalendarJsonImportClient />
          <AcademicCalendarProgrammeHolidays />
        </div>
      </main>
    </>
  );
}
