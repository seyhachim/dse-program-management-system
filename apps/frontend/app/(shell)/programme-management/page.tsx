import { Topbar } from "../topbar";
import { ProgrammeManagementClient } from "./programme-management-client";

export default function ProgrammeManagementPage() {
  return (
    <>
      <Topbar
        title="Programme Management"
        subtitle="Programme profile, learning outcomes, competencies, and course policies"
      />

      <main className="flex-1 overflow-y-auto p-6">
        <ProgrammeManagementClient />
      </main>
    </>
  );
}
