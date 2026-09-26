import type {
  BulkStudentPortalAccessResponse,
  CreateAccountInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  refreshStudentPortalInvitation,
} from "./resend-invitation.ts";
import { authService, ProvisioningError } from "./service.ts";

const DEFAULT_BULK_STUDENT_PORTAL_CONCURRENCY = 3;

type StudentPortalAccessSource = {
  id: string;
  name: string;
  email: string | null;
  status: "Active" | "Inactive" | "Pending";
  userId: string | null;
};

export type StudentPortalAccessPlan = "invite" | "refresh" | "ineligible";
export type BulkStudentPortalAccessOutcome =
  | "invited"
  | "resent"
  | "existing-account"
  | "ineligible";

export function studentPortalAccessPlan(
  student: StudentPortalAccessSource,
): StudentPortalAccessPlan {
  if (student.status !== "Active" || !student.email) return "ineligible";
  return student.userId ? "refresh" : "invite";
}

/**
 * Re-read one Student at execution time before deciding what to do. The existing
 * first-invite and resend services then perform their own authoritative checks
 * again immediately before touching Supabase, so concurrent roster/account
 * changes fail closed instead of widening the operation.
 */
async function deliverStudentPortalAccess(
  studentId: string,
): Promise<BulkStudentPortalAccessOutcome> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      userId: true,
    },
  });
  if (!student) return "ineligible";

  const plan = studentPortalAccessPlan(student);
  if (plan === "ineligible") return "ineligible";

  if (plan === "refresh") {
    const result = await refreshStudentPortalInvitation(student.id);
    return result.status === "resent" ? "resent" : "existing-account";
  }

  if (!student.email) return "ineligible";
  await authService.createAccount({
    name: student.name,
    email: student.email,
    role: "student",
  } satisfies CreateAccountInput);
  return "invited";
}

export type BulkStudentPortalAccessBatchResult = {
  newlyInvited: number;
  resent: number;
  existingAccountSkipped: number;
  ineligibleSkipped: number;
  failed: number;
};

function bulkStudentPortalAccessResponse(
  totalStudents: number,
  counts: BulkStudentPortalAccessBatchResult,
): BulkStudentPortalAccessResponse {
  const invited = counts.newlyInvited + counts.resent;
  const skipped = counts.existingAccountSkipped + counts.ineligibleSkipped;
  return {
    totalStudents,
    ...counts,
    eligible: invited + counts.failed,
    invited,
    skipped,
  };
}

function requireStudentPortalProvisioningConfig(): void {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ProvisioningError(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for account administration",
    );
  }
}

/**
 * Run a bounded worker pool. Expected provider/eligibility failures are counted
 * per student and the batch continues. Any unexpected local/database error stops
 * scheduling additional students so the action fails closed.
 */
export async function runBulkStudentPortalAccessBatch(
  studentIds: string[],
  deliver: (studentId: string) => Promise<BulkStudentPortalAccessOutcome>,
  concurrency = DEFAULT_BULK_STUDENT_PORTAL_CONCURRENCY,
): Promise<BulkStudentPortalAccessBatchResult> {
  const counts: BulkStudentPortalAccessBatchResult = {
    newlyInvited: 0,
    resent: 0,
    existingAccountSkipped: 0,
    ineligibleSkipped: 0,
    failed: 0,
  };
  if (studentIds.length === 0) return counts;

  const workerCount = Math.min(
    studentIds.length,
    Math.max(1, Math.floor(concurrency)),
  );
  let nextIndex = 0;
  let abort = false;
  let fatalError: unknown;

  const worker = async () => {
    while (!abort) {
      const index = nextIndex;
      nextIndex += 1;
      const studentId = studentIds[index];
      if (!studentId) return;

      try {
        const outcome = await deliver(studentId);
        if (outcome === "invited") counts.newlyInvited += 1;
        else if (outcome === "resent") counts.resent += 1;
        else if (outcome === "existing-account") counts.existingAccountSkipped += 1;
        else counts.ineligibleSkipped += 1;
      } catch (error) {
        if (error instanceof ProvisioningError) {
          counts.failed += 1;
          continue;
        }
        fatalError = error;
        abort = true;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (abort) throw fatalError;
  return counts;
}

/**
 * Send/refresh Student Portal access across the complete PMS Student dataset.
 * New students receive a first invitation, still-pending linked invitations are
 * rotated to a fresh email, and existing/non-pending portal accounts are left
 * unchanged. Inactive students and students without email are skipped.
 */
export async function sendStudentPortalAccessToAll(): Promise<BulkStudentPortalAccessResponse> {
  requireStudentPortalProvisioningConfig();

  const students = await prisma.student.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
  });

  const counts = await runBulkStudentPortalAccessBatch(
    students.map((student) => student.id),
    deliverStudentPortalAccess,
  );
  return bulkStudentPortalAccessResponse(students.length, counts);
}

/**
 * Send/refresh Student Portal access only for the explicitly selected roster rows.
 * The shared request contract caps this at 20 unique Student ids; each id is
 * re-read at execution time and follows the same fail-closed delivery rules as
 * the full-roster action.
 */
export async function sendStudentPortalAccessToSelected(
  studentIds: string[],
): Promise<BulkStudentPortalAccessResponse> {
  requireStudentPortalProvisioningConfig();
  const counts = await runBulkStudentPortalAccessBatch(
    studentIds,
    deliverStudentPortalAccess,
  );
  return bulkStudentPortalAccessResponse(studentIds.length, counts);
}

/**
 * Compatibility export for the #1101 router while frontend/backend deployments
 * may temporarily run different revisions. The endpoint semantics are now the
 * safer #1103 send-or-refresh behavior above.
 */
export const inviteAllEligibleStudents = sendStudentPortalAccessToAll;
