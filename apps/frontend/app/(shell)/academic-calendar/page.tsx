import { Topbar } from "../topbar";
import { AcademicCalendarClient } from "./academic-calendar-client";

export default function AcademicCalendarPage() {
  return (
    <>
      <Topbar
        title="Academic Calendar"
        subtitle="Manage official programme academic periods once and reuse them safely"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <AcademicCalendarClient />
      </main>
    </>
  );
}
