import { createClient } from "@supabase/supabase-js";
import type {
  StudentPortalAccessState,
  StudentPortalAccessStatusResponse,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { invitationEmailsMatch, invitationIsPending } from "./resend-invitation.ts";

const STATUS_LOOKUP_CONCURRENCY = 3;

type PortalStudent = {
  id: string;
  status: string;
  email: string | null;
  userId: string | null;
};

type PortalUser = {
  email: string;
  authId: string | null;
  hasStudentRole: boolean;
};

type PortalAuthIdentity = {
  email?: string | null;
  invited_at?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
};

type AuthLookup =
  | { kind: "ok"; user: PortalAuthIdentity }
  | { kind: "missing" }
  | { kind: "error" };

/**
 * Pure, fail-closed classifier used by both the service and focused tests.
 * Reading portal status must never repair, rotate, delete, or reprovision Auth.
 */
export function classifyStudentPortalAccess(input: {
  student: PortalStudent;
  linkedUser?: PortalUser | null;
  authLookup?: AuthLookup;
}): StudentPortalAccessState {
  const { student } = input;
  if (student.status !== "Active") return "inactive-student";
  if (!student.email) return "no-email";
  if (!student.userId) return "not-invited";

  const linkedUser = input.linkedUser;
  if (
    !linkedUser ||
    !linkedUser.hasStudentRole ||
    !linkedUser.authId ||
    !invitationEmailsMatch(student.email, linkedUser.email)
  ) {
    return "needs-attention";
  }

  if (!input.authLookup || input.authLookup.kind === "error") {
    return "status-unavailable";
  }
  if (input.authLookup.kind === "missing") return "needs-attention";
  if (!invitationEmailsMatch(linkedUser.email, input.authLookup.user.email)) {
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
 * Resolve portal access only for the requested roster rows. The response carries
 * the canonical Student UUID and a small status enum — never User/Auth ids,
 * tokens, links, provider errors, or email addresses.
 */
export async function getStudentPortalAccessStatuses(
  requestedStudentIds: readonly string[],
): Promise<StudentPortalAccessStatusResponse> {
  const studentIds = [...new Set(requestedStudentIds)];
  if (studentIds.length === 0) return { items: [] };

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, status: true, email: true, userId: true },
  });
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const orderedStudents = studentIds
    .map((studentId) => studentsById.get(studentId))
    .filter((student): student is NonNullable<typeof student> => Boolean(student));

  const linkedUserIds = [
    ...new Set(
      orderedStudents
        .map((student) => student.userId)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  ];
  const users = linkedUserIds.length === 0
    ? []
    : await prisma.user.findMany({
        where: { id: { in: linkedUserIds } },
        select: {
          id: true,
          email: true,
          authId: true,
          roleAssignments: {
            select: { role: { select: { slug: true } } },
          },
        },
      });
  const usersById = new Map(
    users.map((user) => [
      user.id,
      {
        email: user.email,
        authId: user.authId,
        hasStudentRole: user.roleAssignments.some((assignment) => assignment.role.slug === "student"),
      } satisfies PortalUser,
    ]),
  );

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = url && serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  const items = await mapWithConcurrency(
    orderedStudents,
    async (student) => {
      const linkedUser = student.userId ? usersById.get(student.userId) ?? null : null;
      const localState = classifyStudentPortalAccess({ student, linkedUser });
      if (localState !== "status-unavailable") {
        return { studentId: student.id, status: localState };
      }

      if (!admin || !linkedUser?.authId) {
        return { studentId: student.id, status: "status-unavailable" as const };
      }

      const { data, error } = await admin.auth.admin.getUserById(linkedUser.authId);
      const authLookup: AuthLookup = error
        ? error.status === 404
          ? { kind: "missing" }
          : { kind: "error" }
        : data.user
          ? { kind: "ok", user: data.user }
          : { kind: "missing" };

      return {
        studentId: student.id,
        status: classifyStudentPortalAccess({ student, linkedUser, authLookup }),
      };
    },
    STATUS_LOOKUP_CONCURRENCY,
  );

  return { items };
}
