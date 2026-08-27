import { Topbar } from "../topbar";
import { CurriculumWorkspace } from "./curriculum-workspace";

export default function CurriculumPage() {
  return (
    <>
      <Topbar
        title="Programme Curriculum"
        subtitle="View and manage the current study plan, mappings, revisions, and curriculum files."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <CurriculumWorkspace />
      </main>
    </>
  );
}
