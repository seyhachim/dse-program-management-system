import { Suspense } from "react";
import { Topbar } from "../../topbar";
import { PortalLoading } from "../portal-state";
import { PortalSchedule } from "./portal-schedule";

export default function PortalSchedulePage() {
  return (
    <>
      <Topbar
        title="My schedule"
        subtitle="Your recurring weekly class timetable"
      />
      <main className="flex-1 overflow-y-auto bg-muted/20 p-3 sm:p-4 md:p-6">
        <Suspense fallback={<PortalLoading />}>
          <PortalSchedule />
        </Suspense>
      </main>
    </>
  );
}
