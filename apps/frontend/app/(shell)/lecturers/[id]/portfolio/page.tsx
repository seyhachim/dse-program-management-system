import { Topbar } from "../../../topbar";
import { LecturerPortfolioReviewClient } from "./review-client";

export default async function LecturerPortfolioReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Topbar
        title="Lecturer Portfolio Review"
        subtitle="Verify professional evidence without changing the lecturer's source record."
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <LecturerPortfolioReviewClient lecturerId={id} />
      </main>
    </>
  );
}
