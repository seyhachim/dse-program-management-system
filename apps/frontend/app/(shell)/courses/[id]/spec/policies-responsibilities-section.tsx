"use client";

import type {
  PolicySection as PolicySectionValue,
  ProgramPolicy,
  StudentResponsibilitySection as StudentResponsibilityValue,
} from "@dse-pms/shared-types";
import { PolicySection } from "./policy-section";
import { StudentResponsibilitySection } from "./student-responsibility-section";

export function PoliciesResponsibilitiesSection({
  policy,
  responsibility,
  programPolicy,
  onPersistPolicy,
  onPersistResponsibility,
  disabled = false,
}: {
  policy: PolicySectionValue;
  responsibility: StudentResponsibilityValue;
  programPolicy: ProgramPolicy | null;
  onPersistPolicy: (value: PolicySectionValue) => Promise<boolean>;
  onPersistResponsibility: (
    value: StudentResponsibilityValue,
  ) => Promise<boolean>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
        <h2 className="text-lg font-bold text-foreground">
          Policies & Responsibilities
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          Programme rules are inherited automatically. Add only course-specific
          requirements and student expectations that are necessary for this
          course.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <PolicySection
          value={policy}
          programPolicy={programPolicy}
          onPersist={onPersistPolicy}
          disabled={disabled}
        />
        <StudentResponsibilitySection
          value={responsibility}
          onPersist={onPersistResponsibility}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
