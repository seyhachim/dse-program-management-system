import { Topbar } from "../../../topbar";
import { NewsArticleClient } from "./news-article-client";
export default async function NewsArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Topbar title="DSE News" subtitle="Programme stories and activities" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6"><NewsArticleClient id={id} /></main>
    </>
  );
}
