import { Topbar } from "../topbar";
import { NewsManageClient } from "./news-manage-client";

export default async function DseNewsManagePage({ searchParams }: { searchParams: Promise<{ activityId?: string }> }) {
  const { activityId } = await searchParams;
  return (
    <>
      <Topbar title="DSE News" subtitle="Draft stories and publish approved programme updates" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <NewsManageClient initialActivityId={activityId ?? ""} />
      </main>
    </>
  );
}
