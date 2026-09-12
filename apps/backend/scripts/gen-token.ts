import { PrismaClient } from "@prisma/client";
import { signToken } from "../src/core/auth/token.ts";
import { parseGenTokenArgs } from "./dev-auth-cli.ts";

/**
 * Mints a dev JWT for a seeded user of the given role. Usage:
 *   bun run gen-token --role admin
 *   bun run gen-token --role student --email developer@example.com
 *   bun run gen-token             # defaults to admin
 *
 * Paste the printed token into apps/frontend/.env.local as NEXT_PUBLIC_DEV_TOKEN.
 * This is a temporary stand-in for a real login flow (Supabase) later.
 */
const prisma = new PrismaClient();

async function main() {
  const { role, email } = parseGenTokenArgs(process.argv.slice(2));
  const include = {
    roleAssignments: {
      where: { role: { slug: role } },
      select: { programmeId: true },
    },
  } as const;

  // Query through the join table (issue #77 phase B is the enforcement source
  // of truth now), not a token-only role override. When --email is supplied the
  // requested user must already hold the requested DB role assignment.
  const user = email
    ? await prisma.user.findUnique({ where: { email }, include })
    : await prisma.user.findFirst({
        where: { roleAssignments: { some: { role: { slug: role } } } },
        include,
      });

  if (!user) {
    throw new Error(
      email
        ? `No user exists with email "${email}". Create/provision the dev persona first.`
        : `No seeded user with role "${role}". Run \`bun run seed\` first.`,
    );
  }
  if (user.roleAssignments.length === 0) {
    throw new Error(`User "${user.email}" does not hold the "${role}" role.`);
  }

  const programmeId = user.roleAssignments[0]?.programmeId ?? null;
  const token = signToken({
    id: user.id,
    email: user.email,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  });
  // Print only the token on the last line so it's easy to copy/pipe.
  console.error(`Token for ${user.email} (${role}), valid 7d:\n`);
  console.log(token);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
