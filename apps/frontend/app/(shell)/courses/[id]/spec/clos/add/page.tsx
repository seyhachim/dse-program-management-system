import { CloWizardPage } from "../clo-wizard-page";

export default async function AddCloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CloWizardPage courseId={id} cloCode={null} />;
}
