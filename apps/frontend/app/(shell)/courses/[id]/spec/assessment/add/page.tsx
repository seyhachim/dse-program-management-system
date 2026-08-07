import { AssessmentFormPage } from "../assessment-form-page";

export default async function AddAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AssessmentFormPage courseId={id} assessmentId={null} />;
}
