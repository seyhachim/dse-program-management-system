import type {
  BulkStudentInvitationResponse,
  CreateAccountInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { authService, ProvisioningError } from "./service.ts";

const DEFAULT_BULK_STUDENT_INVITE_CONCURRENCY = 3;

type StudentInviteSource = {
  id: string;
  name: string;
  email: string | null;
  status: "Active" | "Inactive" | "Pending";
  userId: string | null;
};

export type BulkStudentInviteCandidate = {
  id: string;
  name: string;
  email: string;
};

/**
 * Pre-filter for the bulk action. `authService.createAccount()` rechecks the
 * current Student row before every remote invite, so this list can never widen
 * the authoritative first-invite gate if a Student changes concurrently.
 */
export function bulkStudentInviteCandidate(
  student: StudentInviteSource,
): BulkStudentInviteCandidate | null {
  if (student.status !== "Active" || !student.email || student.userId) return null;
  return { id: student.id, name: student.name, email: student.email };
}

/**
 * Run a bounded worker pool. Provider/eligibility failures are safe per-recipient
 * failures and are counted. Any unexpected local/database error stops scheduling
 * more work so the bulk action fails closed rather than amplifying a bad state.
 */
export async function runBulkStudentInvitationBatch(
  candidates: BulkStudentInviteCandidate[],
  invite: (candidate: BulkStudentInviteCandidate) => Promise<unknown>,
  concurrency = DEFAULT_BULK_STUDENT_INVITE_CONCURRENCY,
): Promise<{ invited: number; failed: number }> {
  if (candidates.length === 0) return { invited: 0, failed: 0 };

  const workerCount = Math.min(
    candidates.length,
    Math.max(1, Math.floor(concurrency)),
  );
  let nextIndex = 0;
  let invited = 0;
  let failed = 0;
  let fatalError: unknown;

  const worker = async () => {
    while (fatalError === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      const candidate = candidates[index];
      if (!candidate) return;

      try {
        await invite(candidate);
        invited += 1;
      } catch (error) {
        if (error instanceof ProvisioningError) {
          failed += 1;
          continue;
        }
        fatalError = error;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (fatalError !== undefined) throw fatalError;
  return { invited, failed };
}

/**
 * Send first-time invitations across the complete PMS Student dataset. This is
 * intentionally not a bulk-resend path: any Student with a linked portal User is
 * skipped, including accounts whose invitation is still pending.
 */
export async function inviteAllEligibleStudents(): Promise<BulkStudentInvitationResponse> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ProvisioningError(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for account administration",
    );
  }

  const students = await prisma.student.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      userId: true,
    },
  });
  const candidates = students.flatMap((student) => {
    const candidate = bulkStudentInviteCandidate(student);
    return candidate ? [candidate] : [];
  });

  const { invited, failed } = await runBulkStudentInvitationBatch(
    candidates,
    (student) => authService.createAccount({
      name: student.name,
      email: student.email,
      role: "student",
    } satisfies CreateAccountInput),
  );

  return {
    totalStudents: students.length,
    eligible: candidates.length,
    invited,
    failed,
    skipped: students.length - candidates.length,
  };
}
