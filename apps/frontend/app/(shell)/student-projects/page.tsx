import { Topbar } from "../topbar";
import { StudentProjectsDirectory } from "./student-projects-directory";

export default function StudentProjectsPage() {
  return (
    <>
      <Topbar
        title="Student Projects"
        subtitle="Discover students' publicly shared projects, skills and verified portfolio evidence"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <StudentProjectsDirectory />
      </main>
    </>
  );
}
