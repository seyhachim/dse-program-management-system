import { Topbar } from "../../topbar";
import { NewsStudentClient } from "./news-student-client";
export default function DseNewsPage() {
  return (
    <>
      <Topbar title="DSE News & Activities" subtitle="News and learning experiences across the programme" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6"><NewsStudentClient /></main>
    </>
  );
}
