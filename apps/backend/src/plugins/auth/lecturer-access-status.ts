import { createClient } from "@supabase/supabase-js";
import type {
  LecturerAccessState,
  LecturerAccessStatusResponse,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { invitationEmailsMatch, invitationIsPending } from "./resend-invitation.ts";

const STATUS_LOOKUP_CONCURRENCY = 3;

type LecturerAccount = {
  id: string;
  email: string;
  authId: string | null;
};

type LecturerAuthIdentity = {
  email?: string | null;
  invited_at?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
};

type AuthLookup =
  | { kind: "ok"; user: LecturerAuthIdentity }
  | { kind: "missing" }
  | { kind: "error" };

/**
 * Fail-closed lecturer account classifier. The read path never repairs, rotates,
 * deletes, or reprovisions authentication identities.
 */
export function classifyLecturerAccess(input: {
  lecturer: Pick<LecturerAccount, "email" | "authId">;
  authLookup?: AuthLookup;
}): LecturerAccessState {
  const { lecturer } = input;
  if (!lecturer.authId) return "no-access";

  if (!input.authLookup || input.authLookup.kind === "error") {
    return "status-unavailable";
  }
  if (input.authLookup.kind === "missing") return "needs-attention";
  if (!invitationEmailsMatch(lecturer.email, input.authLookup.user.email)) {
    return "needs-attention";
  }

  return invitationIsPending(input.authLookup.user)
    ? "invitation-pending"
    : "active-account";
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
  return results;
}

/**
 * Resolve live Auth state only for requested lecturer rows. The response returns
 * the PMS lecturer id plus a small status enum, never provider ids, emails,
 * tokens, invitation links, or raw Supabase errors.
 */
export async function getLecturerAccessStatuses(
  requestedLecturerIds: readonly string[],
): Promise<LecturerAccessStatusResponse> {
  const lecturerIds = [...new Set(requestedLecturerIds)];
  if (lecturerIds.length === 0) return { items: [] };

  const lecturers = await prisma.user.findMany({
    where: {
      id: { in: lecturerIds },
      roleAssignments: { some: { role: { slug: "lecturer" } } },
    },
    select: { id: true, email: true, authId: true },
  });
  const lecturersById = new Map(lecturers.map((lecturer) => [lecturer.id, lecturer]));
  const orderedLecturers = lecturerIds
    .map((lecturerId) => lecturersById.get(lecturerId))
    .filter((lecturer): lecturer is NonNullable<typeof lecturer> => Boolean(lecturer));

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = url && serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  const items = await mapWithConcurrency(
    orderedLecturers,
    async (lecturer) => {
      const localState = classifyLecturerAccess({ lecturer });
      if (localState === "no-access") {
        return { lecturerId: lecturer.id, status: localState };
      }

      if (!admin || !lecturer.authId) {
        return { lecturerId: lecturer.id, status: "status-unavailable" as const };
      }

      const { data, error } = await admin.auth.admin.getUserById(lecturer.authId);
      const authLookup: AuthLookup = error
        ? error.status === 404
          ? { kind: "missing" }
          : { kind: "error" }
        : data.user
          ? { kind: "ok", user: data.user }
          : { kind: "missing" };

      return {
        lecturerId: lecturer.id,
        status: classifyLecturerAccess({ lecturer, authLookup }),
      };
    },
    STATUS_LOOKUP_CONCURRENCY,
  );

  return { items };
}
