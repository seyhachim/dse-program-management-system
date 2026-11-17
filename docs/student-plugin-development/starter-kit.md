# Student Plugin Starter — inactive reference scaffold (#1302)

**Status: example source code only.** The example is compile-checked in the existing workspaces, but the PMS startup does **not** import/register it, no sidebar route is added, and no new permissions are seeded. It is **not installed** in the live PMS. The developer guide and authorization pattern are based on [ADR #1301](https://github.com/seyhachim/dse-program-management-system/issues/1301).

## Purpose

Give student teams a narrow, realistic end-to-end example of a DSE PMS build-time plugin before they build an extracurricular feature such as #1305 (DSE Event Participation). This example is read-only, stateless and **uses no real academic records or database tables**.

## Scaffold files

| Layer | Example |
| --- | --- |
| Manifest, API request/response Zod | `packages/shared-types/src/student-plugin-starter.ts` |
| Shared export | `packages/shared-types/src/index.ts` |
| Backend plugin object | `apps/backend/src/plugins/student-plugin-starter/index.ts` |
| Backend router and permissions | `apps/backend/src/plugins/student-plugin-starter/router.ts` |
| Programme authorization | `apps/backend/src/plugins/student-plugin-starter/authorization.ts` |
| Public service (stateless) | `apps/backend/src/plugins/student-plugin-starter/service.ts` |
| Frontend UI component | `apps/frontend/components/student-plugin-starter-example.tsx` |
| Tests | `packages/shared-types/src/student-plugin-starter.test.ts` and `apps/backend/src/plugins/student-plugin-starter/starter.test.ts` |

The unmounted backend router illustrates `GET /api/student-plugin-starter/welcome?programmeId=dse`: **authentication → namespaced permission → exact programme-scope check → Zod response**.

### Why the sample does not automatically work as a public URL

DSE PMS intentionally imports/registers each trusted backend plugin in `apps/backend/src/core/app.ts`. Its frontend sidebar is assembled independently from `apps/frontend/lib/nav.ts`. Simply dropping files into a directory or uploading a package will **never activate a plugin**.

Moreover, this router calls `requirePermission("student-plugin-starter:read")`: **no role has that permission in the existing seed**. A new manifest does not grant it. A maintainer must separately review the permission definition and exact role-to-permission mapping in `apps/backend/prisma/seed.ts`; for hosted deployments, any change must follow the usual safe configuration/migration/release process. Do not bypass the gate just to make the example work.

### Local integration walkthrough — maintainer reviewed only, not part of this PR

1. Fork the repository, use [#1303](https://github.com/seyhachim/dse-program-management-system/issues/1303) isolated PostgreSQL and synthetic `@dse.dev` fixtures, and choose a new lowercase kebab-case plugin ID that is not already used.
2. Copy/adapt the manifest, Zod schemas, service, authorization and router. A plugin must never read or write another domain's private Prisma tables as a shortcut; approved cross-plugin reads use a narrow `registry.get<Contract>(id).service` interface.
3. In a **separate activation PR**, register `studentPluginStarter` explicitly in `apps/backend/src/core/app.ts`, mapping the service/router to `/api/student-plugin-starter`. For frontend, create a page under `apps/frontend/app/(shell)/student-plugin-starter/page.tsx` using the sample component and include the manifest in the `frontendManifests` composition inside `apps/frontend/lib/nav.ts`.
4. Have a maintainer review and add the plugin's dedicated permission to the seed's permission inventory and **specific authorised roles**. Check for any extra permission mapping that needs to be updated. Never expand existing `students:write`, `qa:write`, curriculum or auth permissions as a convenience.
5. Add complete **HTTP route/database integration tests** for no token (401), wrong role (403), wrong programme (403), malformed query (400), successful allowed user, and forbidden cross-object access once the domain has persisted records. The included tests are *unit contract/authorization tests only*; do not call this sample end-to-end tested until those integration tests pass on isolated fixtures.
6. Run repo gates; PR reviewed and merged only by an authorized maintainer. No students get production credentials or direct deploy privileges.

## Testing the scaffold itself

From repository root, with Bun **1.2.23** and dependencies installed:

```bash
bun test packages/shared-types/src/student-plugin-starter.test.ts
bun test apps/backend/src/plugins/student-plugin-starter/starter.test.ts
bunx prisma validate --schema apps/backend/prisma/schema.prisma
bun run typecheck
bun run lint
bun run test
bun run test:backend
bun run build
```

The test fixtures intentionally use fictional names and invented programme IDs. A full clean checkout and locally-owned PostgreSQL smoke remain required before #1302/#1303 are considered fully accepted.

## Safety rules for students

- No runtime installer, arbitrary package upload, dynamic import, privileged fork workflow or trusted execution of student code.
- No real students, class attendance, assessment results, official calendars, QA documents, migration on hosted databases, role/auth mutation, bot tokens or production URLs.
- No client-side role hiding as a substitute for API permission and exact record/programme ownership checks.
- Never handle a backend DB or Supabase service-role key from frontend, screenshot, GitHub issue or CI fork.
- New dependency, licence/IP, migrations or external API calls require explicit maintainer review under #1304/#1306.
- Keep optional features (persistent data, event CRUD/check-in, QR or certification) for subsequent reviewed issues. This scaffold is deliberately minimal.

## Ready-to-accept checklist

- [x] Source pattern and typed Zod contract provided in a non-activated scaffold
- [x] Backend auth + explicit permission + programme authorization shown
- [x] Frontend example with loading/error/empty states
- [x] Unit checks for denied/allowed programme combinations, query and response validation
- [ ] CI typecheck/lint/test/build verified
- [ ] Actual guarded end-to-end mount and HTTP 401/403/400/200 tests performed using #1303 isolated fixture
- [ ] Independent maintainer reviews, documented role/permission mapping and CODEOWNER capacity checked
- [ ] A student newcomer follows instructions without repository write/production access

Until the unchecked gates pass, #1302 remains **in progress**. No student code should be merged or deployed automatically.
