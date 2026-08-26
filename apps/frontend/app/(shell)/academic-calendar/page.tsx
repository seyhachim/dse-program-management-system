import { Topbar } from "../topbar";
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
          <AcademicCalendarSharePanel />
        </div>
      </main>
    </>
  );
}
