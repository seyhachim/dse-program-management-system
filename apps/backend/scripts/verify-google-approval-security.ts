import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type TableRow = { name: string; rls_enabled: boolean; has_append_only_trigger: boolean };
type GrantRow = { object_name: string; grantee: string; privilege_type: string };

async function main(): Promise<void> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT c.relname::text AS name, c.relrowsecurity AS rls_enabled,
      EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid
        AND NOT t.tgisinternal AND t.tgname = 'google_approval_append_only' AND t.tgenabled = 'O')
        AS has_append_only_trigger
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pms_auth_security' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname`;
  const actual = tables.map((t) => t.name).sort();
  const expected = ["google_identity_approval_event", "google_link_intent"];
  if (JSON.stringify(actual) !== JSON.stringify(expected) || tables.some((t) => !t.rls_enabled) ||
      !tables.find((t) => t.name === "google_identity_approval_event")?.has_append_only_trigger) {
    throw new Error("Google approval security inventory, RLS or append-only trigger failed");
  }

  const tableGrants = await prisma.$queryRaw<GrantRow[]>`
    SELECT c.relname::text AS object_name, COALESCE(r.rolname, 'PUBLIC')::text AS grantee,
      acl.privilege_type::text AS privilege_type
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
    LEFT JOIN pg_roles r ON r.oid = acl.grantee
    WHERE n.nspname = 'pms_auth_security' AND c.relkind IN ('r', 'p')
      AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated', 'service_role'))`;
  if (tableGrants.length) throw new Error("Google approval table has a Data API or public grant");

  const exposed = await prisma.$queryRaw<Array<{ role_name: string; has_usage: boolean }>>`
    SELECT rolname::text AS role_name,
      has_schema_privilege(oid, 'pms_auth_security', 'USAGE') AS has_usage
    FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')`;
  if (exposed.some((r) => r.has_usage)) throw new Error("Data API role can use Google approval schema");
  console.log("Google approval schema inventory, append-only audit, RLS and Data API isolation: OK");
}

try { await main(); }
finally { await prisma.$disconnect(); }
