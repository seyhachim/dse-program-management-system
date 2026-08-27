import { Topbar } from "../topbar";
import { AcademicCalendarJsonImportClient } from "./academic-calendar-json-import-client";
import { AcademicCalendarProgrammeHolidays } from "./academic-calendar-programme-holidays";
import { AcademicCalendarSharePanel } from "./academic-calendar-share-panel";
import { AcademicCalendarSimpleClient } from "./academic-calendar-simple-client";

export default function AcademicCalendarPage() {
  return (
    <>
      <Topbar
        title="Academic Calendar"
        subtitle="Manage official programme academic periods once and reuse them safely"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="space-y-6">
          <AcademicCalendarSimpleClient />
          <AcademicCalendarProgrammeHolidays />
          <div className="mx-auto max-w-7xl rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
            <p className="font-medium">JSON import scope</p>
            <p className="mt-1 text-muted-foreground">
              One JSON file represents one Academic Year. It may include calendar data for Year 1, Year 2, shared Years 3–4, or any other valid Years 1–4 combination. Programme-wide holidays apply to all study years.
            </p>
          </div>
          <AcademicCalendarJsonImportClient />
          <AcademicCalendarSharePanel />
        </div>
      </main>
    </>
  );
}
