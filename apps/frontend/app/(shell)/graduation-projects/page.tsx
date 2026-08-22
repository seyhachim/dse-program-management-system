import { Topbar } from "../topbar";
import { GraduationProjectsClient } from "./graduation-projects-client";

export default function GraduationProjectsPage() {
  return (
    <>
      <Topbar title="Final Projects" subtitle="Year-4 project, thesis and internship supervision" />
      <main className="flex-1 overflow-y-auto p-6">
        <GraduationProjectsClient />
      </main>
    </>
  );
}
