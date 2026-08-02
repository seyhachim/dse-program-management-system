import { CloWizardPage } from "../../clo-wizard-page";

export default async function EditCloPage({
  params,
}: {
  params: Promise<{ id: string; cloCode: string }>;
}) {
  const { id, cloCode } = await params;
  return <CloWizardPage courseId={id} cloCode={cloCode} />;
}
