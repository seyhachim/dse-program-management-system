import { OfferingActivationExceptionPanel } from "../../activation-exception-panel";
import { CurriculumBoundOfferingFormPage } from "../../curriculum-bound-offering-form-page";

export default async function EditOfferingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <CurriculumBoundOfferingFormPage offeringId={id} />
      <OfferingActivationExceptionPanel offeringId={id} />
    </>
  );
}
