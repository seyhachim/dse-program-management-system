import { Topbar } from "../../topbar";
import { PortalSchedule } from "./portal-schedule";

export default function PortalSchedulePage() {
  return (
    <>
      <Topbar
        title="Schedule"
        subtitle="Your recurring weekly class timetable"
      />
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <PortalSchedule />
      </main>
    </>
  );
}
