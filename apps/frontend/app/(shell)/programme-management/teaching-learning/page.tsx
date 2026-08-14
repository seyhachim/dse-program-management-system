import Link from "next/link";
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
          <Link
            href="/programme-management"
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-input/50"
          >
            ← Back to Programme Management
          </Link>
        </div>
        <TeachingVocabularyClient />
      </main>
    </>
  );
}
