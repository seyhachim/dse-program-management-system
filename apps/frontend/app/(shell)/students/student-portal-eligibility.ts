import type { Student } from "@dse-pms/shared-types";

type PortalProvisioningStudent = Pick<Student, "studentId" | "email" | "status">;

export function studentPortalProvisioningBlocker(
  student: PortalProvisioningStudent | null,
): string | null {
  if (!student) {
    return "Select one Active student with an official Student ID and institutional email to provision portal access.";
  }
  if (!student.studentId) {
    return "Add an official Student ID before provisioning portal access.";
  }
  if (student.status !== "Active") {
    return "Activate this student before provisioning portal access.";
  }
  if (!student.email) {
    return "Add an institutional email before provisioning portal access.";
  }
  return null;
}

export function canToggleStudentActive(student: Pick<Student, "studentId">): boolean {
  return Boolean(student.studentId);
}
