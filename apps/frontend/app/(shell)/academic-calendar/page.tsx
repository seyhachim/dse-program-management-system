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
        <div className="academic-calendar-page space-y-6">
          <AcademicCalendarSimpleClient />
          <AcademicCalendarProgrammeHolidays />
          <AcademicCalendarJsonImportClient />
          <AcademicCalendarSharePanel />
        </div>
      </main>
      <style>{`
        .academic-calendar-page section.rounded-2xl.border.border-border.p-4 {
          display: none;
        }
      `}</style>
    </>
  );
}
