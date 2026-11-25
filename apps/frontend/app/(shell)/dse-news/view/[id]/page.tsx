import { Topbar } from "../../../topbar";
import { NewsArticleClient } from "../../../portal/news/[id]/news-article-client";

export default async function DseNewsStaffPreviewPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Topbar title="DSE News Article" subtitle="Staff preview of the complete programme article" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <NewsArticleClient id={id} staffPreview />
      </main>
    </>
  );
}
