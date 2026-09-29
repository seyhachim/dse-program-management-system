import type {
  CreateAccountInput,
  LecturerInvitationBatchResponse,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { refreshLecturerInvitation } from "./resend-invitation.ts";
import { authService, ProvisioningError } from "./service.ts";

const DEFAULT_SELECTED_LECTURER_CONCURRENCY = 3;

export type LecturerInvitationOutcome =
  | "invited"
  | "resent"
  | "existing-account"
  | "missing-lecturer";

export type LecturerInvitationBatchCounts = {
  newlyInvited: number;
  resent: number;
  existingAccountSkipped: number;
  missingLecturerSkipped: number;
  failed: number;
};

function requireLecturerProvisioningConfig(): void {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ProvisioningError(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for account administration",
    );
  }
}

/**
 * Re-read one lecturer at execution time. A missing/wrong-role row is skipped;
 * pending identities reuse the hardened resend path; activated accounts are
 * reported unchanged; and no-access lecturers use the existing first-invite
 * service.
 */
async function deliverLecturerInvitation(
  lecturerId: string,
): Promise<LecturerInvitationOutcome> {
  const lecturer = await prisma.user.findFirst({
    where: {
      id: lecturerId,
      roleAssignments: { some: { role: { slug: "lecturer" } } },
    },
    select: { id: true, name: true, email: true, authId: true },
  });
  if (!lecturer) return "missing-lecturer";

  if (lecturer.authId) {
    const result = await refreshLecturerInvitation(lecturer.id);
    return result.status === "resent" ? "resent" : "existing-account";
  }

  await authService.createAccount({
    name: lecturer.name,
    email: lecturer.email,
    role: "lecturer",
  } satisfies CreateAccountInput);
  return "invited";
}

/**
 * Run a bounded worker pool. Provider/provisioning failures are counted per
 * lecturer so one bad address or rate-limit response does not widen the batch.
 * Unexpected database/programming failures stop new scheduling and fail closed.
 */
export async function runSelectedLecturerInvitationBatch(
  lecturerIds: string[],
  deliver: (lecturerId: string) => Promise<LecturerInvitationOutcome>,
  concurrency = DEFAULT_SELECTED_LECTURER_CONCURRENCY,
): Promise<LecturerInvitationBatchCounts> {
  const counts: LecturerInvitationBatchCounts = {
    newlyInvited: 0,
    resent: 0,
    existingAccountSkipped: 0,
    missingLecturerSkipped: 0,
    failed: 0,
  };
  if (lecturerIds.length === 0) return counts;

  const workerCount = Math.min(
    lecturerIds.length,
    Math.max(1, Math.floor(concurrency)),
  );
  let nextIndex = 0;
  let abort = false;
  let fatalError: unknown;

  const worker = async () => {
    while (!abort) {
      const index = nextIndex;
      nextIndex += 1;
      const lecturerId = lecturerIds[index];
      if (!lecturerId) return;

      try {
        const outcome = await deliver(lecturerId);
        if (outcome === "invited") counts.newlyInvited += 1;
        else if (outcome === "resent") counts.resent += 1;
        else if (outcome === "existing-account") counts.existingAccountSkipped += 1;
        else counts.missingLecturerSkipped += 1;
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

export async function sendLecturerInvitationsToSelected(
  lecturerIds: string[],
): Promise<LecturerInvitationBatchResponse> {
  requireLecturerProvisioningConfig();
  const counts = await runSelectedLecturerInvitationBatch(
    lecturerIds,
    deliverLecturerInvitation,
  );

  return {
    totalLecturers: lecturerIds.length,
    ...counts,
  };
}
