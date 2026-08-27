import Link from "next/link";
import { Button } from "@dse-pms/ui";
import { Topbar } from "../topbar";
import { AcademicCalendarJsonImportClient } from "./academic-calendar-json-import-client";
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
          <div className="mx-auto flex max-w-7xl flex-col gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Programme-wide holidays</p>
              <p className="mt-1 text-muted-foreground">
                Holiday import, draft review, editing, removal, and publishing now live in a focused workspace.
              </p>
            </div>
            <Button type="button" variant="outline" render={<Link href="/academic-calendar/holidays">Manage holidays</Link>} />
          </div>
          <div className="mx-auto max-w-7xl rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
            <p className="font-medium">JSON import scope</p>
            <p className="mt-1 text-muted-foreground">
              One JSON file represents one Academic Year. It may include calendar data for Year 1, Year 2, shared Years 3–4, or any other valid Years 1–4 combination. Use Programme Holidays for holiday-only JSON and holiday draft management.
            </p>
          </div>
          <AcademicCalendarJsonImportClient />
          <AcademicCalendarSharePanel />
        </div>
      </main>
    </>
  );
}
