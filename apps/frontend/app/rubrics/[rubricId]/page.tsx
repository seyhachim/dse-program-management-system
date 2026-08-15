import { PublicRubricPage } from "./public-rubric-page";

export default async function PublicRubricRoute({
  params,
}: {
  params: Promise<{ rubricId: string }>;
}) {
  const { rubricId } = await params;
  return <PublicRubricPage rubricId={rubricId} />;
}
