import { Topbar } from "../topbar";
import { StudentHandbookClient } from "./student-handbook-client";

export default function StudentHandbookPage() {
  return (
    <>
      <Topbar
        title="Student Handbook"
        subtitle="One assigned lecturer authors the handbook; PMS source data stays read-only"
      />
      <main className="flex-1 overflow-y-auto">
        <StudentHandbookClient />
      </main>
    </>
  );
}
