import type { ClassResponsibilityRole } from "@dse-pms/shared-types";

const CLASS_RESPONSIBILITY_LABELS: Record<ClassResponsibilityRole, string> = {
  ClassMonitor: "Class Monitor",
  SubClassMonitor: "Deputy Class Monitor",
};

export function classResponsibilityLabel(role: ClassResponsibilityRole): string {
  return CLASS_RESPONSIBILITY_LABELS[role];
}
