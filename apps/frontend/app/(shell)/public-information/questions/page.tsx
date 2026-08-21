import { Topbar } from "../../topbar";
import { UnansweredQuestionsClient } from "./unanswered-questions-client";

export default function PublicInformationQuestionsPage() {
  return (
    <>
      <Topbar
        title="Ask DSE Information Gaps"
        subtitle="Review unanswered and low-confidence public questions"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <UnansweredQuestionsClient />
      </main>
    </>
  );
}
