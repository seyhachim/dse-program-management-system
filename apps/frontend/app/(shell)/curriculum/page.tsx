import { Topbar } from "../topbar";
import { CurriculumPageClient } from "./curriculum-page-client";

export default function CurriculumPage() {
  return (
    <>
      <Topbar
        title="Programme Curriculum"
        subtitle="View the complete DSE curriculum by year, semester, version, and revision history."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <CurriculumPageClient />
      </main>
    </>
  );
}
