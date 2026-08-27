import Link from "next/link";
import { buttonVariants } from "@dse-pms/ui";
import { Topbar } from "../topbar";
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
          <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
              <p className="font-medium">Programme-wide holidays</p>
              <p className="mt-1 text-muted-foreground">
                Review pending holidays, add/edit/remove entries, import holiday JSON, and publish the correction from the dedicated holiday workspace.
              </p>
              <Link className={`${buttonVariants({ variant: "outline" })} mt-3`} href="/academic-calendar/holidays">
                Manage programme holidays
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
              <p className="font-medium">Import full calendar JSON</p>
              <p className="mt-1 text-muted-foreground">
                Use the dedicated import page for files that contain Year 1–4 semester periods. The main calendar page stays focused on review and management.
              </p>
              <Link className={`${buttonVariants({ variant: "outline" })} mt-3`} href="/academic-calendar/import">
                Open JSON import
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
