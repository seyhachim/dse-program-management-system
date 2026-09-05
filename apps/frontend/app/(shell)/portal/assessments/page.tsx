import { Topbar } from "../../topbar";
import { PortalAssessments } from "./portal-assessments";

export default function PortalAssessmentsPage() {
  return (
    <>
      <Topbar
        title="Assessments"
        subtitle="Deadlines, grading weights, instructions, and rubrics"
      />
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <PortalAssessments />
      </main>
    </>
  );
}
