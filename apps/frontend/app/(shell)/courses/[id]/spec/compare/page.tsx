import { Suspense } from "react";
import { Topbar } from "../../../../topbar";
import { CompareClient } from "./compare-client";

export default async function CompareCourseSpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Topbar title="Compare Course Specifications" subtitle="Read-only academic version comparison" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading comparison…</p>}>
            <CompareClient courseId={id} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
