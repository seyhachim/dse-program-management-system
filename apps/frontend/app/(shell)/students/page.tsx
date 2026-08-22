import Link from "next/link";
import { Topbar } from "../topbar";
import { StudentsClient } from "./students-client";

export default function StudentsPage() {
  return (
    <>
      <Topbar title="Students" subtitle="Student records — CRUD, list, profile" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex justify-end">
          <Link
            href="/students/cohorts"
            className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Manage cohorts & progression
          </Link>
        </div>
        <StudentsClient />
      </main>
    </>
  );
}
