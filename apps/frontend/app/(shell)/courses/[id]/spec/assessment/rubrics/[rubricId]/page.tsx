import { RubricDetailPage } from "../rubric-detail-page";

export default async function CourseRubricDetailRoute({
  params,
}: {
  params: Promise<{ id: string; rubricId: string }>;
}) {
  const { id, rubricId } = await params;
  return <RubricDetailPage courseId={id} rubricId={rubricId} />;
}
