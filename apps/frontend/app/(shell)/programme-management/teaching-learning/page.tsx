import Link from "next/link";
import { Button } from "@dse-pms/ui";
import { Topbar } from "../../topbar";
import { TeachingVocabularyClient } from "./teaching-vocabulary-client";

export default function TeachingLearningVocabularyPage() {
  return (
    <>
      <Topbar
        title="Teaching & Learning Vocabulary"
        subtitle="Programme-approved teaching methods and active learning strategies"
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-5">
          <Button asChild variant="outline" size="sm">
            <Link href="/programme-management">← Back to Programme Management</Link>
          </Button>
        </div>
        <TeachingVocabularyClient />
      </main>
    </>
  );
}
