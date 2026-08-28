import { Topbar } from "../../topbar";
import {
  AunQaStaffEvidenceSection,
  ProfessionalEvidenceSection,
} from "../professional-evidence-section";

export default function LecturerPortfolioEvidencePage() {
  return (
    <>
      <Topbar
        title="Professional Evidence"
        subtitle="Maintain your professional record and generate auditable AUN-QA staff evidence."
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
            <strong>Privacy & provenance:</strong> new records are private and self-declared by default. PMS teaching remains authoritative in Course Offerings and is never copied into these records. Admin/Programme Coordinator review changes verification state without rewriting your source record.
          </section>
          <ProfessionalEvidenceSection />
          <AunQaStaffEvidenceSection />
        </div>
      </main>
    </>
  );
}
