import Link from "next/link";
import { Topbar } from "../../topbar";
import { ProgrammeLeadershipClient } from "./programme-leadership-client";

export default function ProgrammeLeadershipPage() {
  return (
    <>
      <Topbar
        title="Programme Leadership"
        subtitle="Official Head of Program appointment, coordinator access, and appointment history"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-5">
          <Link href="/programme-management" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Back to Programme Management
          </Link>
        </div>
        <ProgrammeLeadershipClient />
      </main>
    </>
  );
}
