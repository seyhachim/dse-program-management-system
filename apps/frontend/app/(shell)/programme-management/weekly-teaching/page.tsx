import Link from "next/link";
import { Topbar } from "../../topbar";
import { WeeklyTeachingMonitorClient } from "./weekly-teaching-monitor-client";

export default function WeeklyTeachingMonitorPage() {
  return (
    <>
      <Topbar
        title="Weekly Teaching Monitor"
        subtitle="DSE scheduled classes, actual delivery, cancellations and missing evidence • Admin & Head of Program"
      />
      <main className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <Link
            href="/programme-management"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Back to Programme Management
          </Link>
          <WeeklyTeachingMonitorClient />
        </div>
      </main>
    </>
  );
}
