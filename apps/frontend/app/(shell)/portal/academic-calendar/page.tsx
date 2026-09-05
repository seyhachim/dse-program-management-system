import { Topbar } from "../../topbar";
import { PortalAcademicCalendar } from "./portal-academic-calendar";

export default function StudentAcademicCalendarPage() {
  return (
    <>
      <Topbar
        title="Academic Calendar"
        subtitle="Official dates for your current study year"
      />
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <PortalAcademicCalendar />
      </main>
    </>
  );
}
