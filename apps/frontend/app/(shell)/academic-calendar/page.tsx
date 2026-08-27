import { Topbar } from "../topbar";
import { AcademicCalendarProgrammeHolidays } from "./academic-calendar-programme-holidays";
import { AcademicCalendarRefreshBridge } from "./academic-calendar-refresh-bridge";
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
        <div className="academic-calendar-page space-y-6">
          <AcademicCalendarRefreshBridge />
          <AcademicCalendarSimpleClient />
          <AcademicCalendarProgrammeHolidays />
          <AcademicCalendarSharePanel />
        </div>
      </main>
    </>
  );
}
