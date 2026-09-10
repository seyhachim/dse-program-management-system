from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f"Anchor not found in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def add_role_permissions(slug: str, permissions: list[str]) -> None:
    path = "apps/backend/prisma/seed.ts"
    text = read(path)
    pattern = re.compile(
        rf'(slug: "{re.escape(slug)}",.*?permissions: \[)(.*?)(\n    \],\n  \}},)',
        re.S,
    )
    match = pattern.search(text)
    if not match:
        raise RuntimeError(f"Role permissions block not found for {slug}")
    body = match.group(2)
    additions = "".join(
        f'\n      "{permission}",' for permission in permissions if f'"{permission}"' not in body
    )
    replacement = match.group(1) + body + additions + match.group(3)
    write(path, text[: match.start()] + replacement + text[match.end() :])


# ---------------------------------------------------------------------------
# Shared contracts / manifest
# ---------------------------------------------------------------------------
replace_once(
    "packages/shared-types/src/index.ts",
    'export * from "./lecturer-portfolio-plugin.ts";\n',
    'export * from "./lecturer-portfolio-plugin.ts";\nexport * from "./final-project.ts";\n',
)

final_project_manifest = r'''
export const finalProjectManifest: PluginManifest = {
  id: "final-project",
  name: "Final Project",
  version: "0.1.0",
  description:
    "Year 4 supervisor discovery, lecturer supervision profiles, and programme capacity overview.",
  routes: [
    {
      label: "Final Project",
      path: "/final-project",
      icon: "graduation-cap",
      roles: ["admin", "program_coordinator", "lecturer", "student"],
      group: "Final Project",
    },
  ],
  permissions: [
    "final-project:read",
    "final-project:write",
    "final-project:manage",
  ],
};

'''
replace_once(
    "packages/shared-types/src/plugins.ts",
    'export const placeholdersManifest: PluginManifest = {\n',
    final_project_manifest + 'export const placeholdersManifest: PluginManifest = {\n',
)
replace_once(
    "packages/shared-types/src/plugins.ts",
    '  programmeManifest,\n  qaManifest,\n',
    '  programmeManifest,\n  finalProjectManifest,\n  qaManifest,\n',
)

# ---------------------------------------------------------------------------
# Prisma schema: programme-scoped profile + normalized tracks / ideas / audit
# ---------------------------------------------------------------------------
replace_once(
    "apps/backend/prisma/schema.prisma",
    '  lecturerProfile                    LecturerProfile?\n',
    '  lecturerProfile                    LecturerProfile?\n'
    '  finalProjectSupervisorProfiles      FinalProjectSupervisorProfile[]     @relation("FinalProjectSupervisorUser")\n'
    '  finalProjectSupervisorAuditEvents   FinalProjectSupervisorProfileAudit[] @relation("FinalProjectSupervisorAuditActor")\n',
)
replace_once(
    "apps/backend/prisma/schema.prisma",
    '  academicYears            AcademicYear[]\n',
    '  academicYears            AcademicYear[]\n  finalProjectSupervisorProfiles FinalProjectSupervisorProfile[]\n',
)

final_project_models = r'''
/// Programme-scoped Year 4 supervisor discovery profile. User remains the identity
/// source of truth; this table owns only final-project supervision availability.
model FinalProjectSupervisorProfile {
  id                String    @id @default(uuid()) @db.Uuid
  programmeId       String
  programme         Programme @relation(fields: [programmeId], references: [id], onDelete: Restrict)
  lecturerUserId    String
  lecturer          User      @relation("FinalProjectSupervisorUser", fields: [lecturerUserId], references: [id], onDelete: Restrict)
  statement         String    @default("")
  capacity          Int       @default(0)
  acceptingStudents Boolean   @default(false)
  isPublished       Boolean   @default(false)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  tracks      FinalProjectResearchTrack[]
  auditEvents FinalProjectSupervisorProfileAudit[]

  @@unique([programmeId, lecturerUserId])
  @@index([programmeId, isPublished, acceptingStudents])
  @@index([lecturerUserId])
}

/// Lecturer-authored research area used by students to understand supervision fit.
model FinalProjectResearchTrack {
  id                  String                        @id @default(uuid()) @db.Uuid
  supervisorProfileId String                        @db.Uuid
  supervisorProfile   FinalProjectSupervisorProfile @relation(fields: [supervisorProfileId], references: [id], onDelete: Cascade)
  title               String
  description         String                        @default("")
  sortOrder           Int                           @default(0)
  createdAt           DateTime                      @default(now())
  updatedAt           DateTime                      @updatedAt

  ideas FinalProjectProjectIdea[]

  @@unique([supervisorProfileId, title])
  @@index([supervisorProfileId, sortOrder])
}

/// Example project direction inside one research track. It is guidance for discovery,
/// not a student application, assignment, proposal approval, or official project record.
model FinalProjectProjectIdea {
  id              String                    @id @default(uuid()) @db.Uuid
  researchTrackId String                    @db.Uuid
  researchTrack   FinalProjectResearchTrack @relation(fields: [researchTrackId], references: [id], onDelete: Cascade)
  title           String
  summary         String                    @default("")
  skills          String[]                  @default([])
  sortOrder       Int                       @default(0)
  createdAt       DateTime                  @default(now())
  updatedAt       DateTime                  @updatedAt

  @@unique([researchTrackId, title])
  @@index([researchTrackId, sortOrder])
}

/// Append-only snapshot of every supervisor-profile create/update action. This is
/// discovery governance evidence only; later official assignment history is separate.
model FinalProjectSupervisorProfileAudit {
  id                  String                        @id @default(uuid()) @db.Uuid
  supervisorProfileId String                        @db.Uuid
  supervisorProfile   FinalProjectSupervisorProfile @relation(fields: [supervisorProfileId], references: [id], onDelete: Restrict)
  actorId             String
  actor               User                          @relation("FinalProjectSupervisorAuditActor", fields: [actorId], references: [id], onDelete: Restrict)
  action              String
  snapshot            Json
  createdAt           DateTime                      @default(now())

  @@index([supervisorProfileId, createdAt])
  @@index([actorId, createdAt])
}

'''
replace_once(
    "apps/backend/prisma/schema.prisma",
    '/// Security-only account recovery audit. Password values are never stored.\n',
    final_project_models + '/// Security-only account recovery audit. Password values are never stored.\n',
)

# ---------------------------------------------------------------------------
# Permission seed: permission catalogue derives from manifests; role grants stay explicit.
# ---------------------------------------------------------------------------
replace_once(
    "apps/backend/prisma/seed.ts",
    '  "qa:write":\n    "Manage programme quality-assurance evidence and self-assessments",\n',
    '  "qa:write":\n    "Manage programme quality-assurance evidence and self-assessments",\n'
    '  "final-project:read": "View final-project supervisor discovery",\n'
    '  "final-project:write": "Maintain own final-project supervisor profile",\n'
    '  "final-project:manage": "View programme final-project supervisor capacity",\n',
)
add_role_permissions("admin", ["final-project:read", "final-project:write", "final-project:manage"])
add_role_permissions("program_coordinator", ["final-project:read", "final-project:manage"])
add_role_permissions("lecturer", ["final-project:read", "final-project:write"])
add_role_permissions("student", ["final-project:read"])

# ---------------------------------------------------------------------------
# Backend registration
# ---------------------------------------------------------------------------
replace_once(
    "apps/backend/src/core/app.ts",
    'import { communityPlugin } from "../plugins/community/index.ts";\n',
    'import { communityPlugin } from "../plugins/community/index.ts";\n'
    'import { finalProjectPlugin } from "../plugins/final-project/index.ts";\n',
)
replace_once(
    "apps/backend/src/core/app.ts",
    '  registry.register(communityPlugin);\n',
    '  registry.register(communityPlugin);\n  registry.register(finalProjectPlugin);\n',
)

# ---------------------------------------------------------------------------
# Backend plugin
# ---------------------------------------------------------------------------
write(
    "apps/backend/src/plugins/final-project/scope.ts",
    r'''import type { AuthUser } from "../../core/auth/token.ts";
import { hasRoleInProgramme } from "../../core/auth/token.ts";

export function canReadFinalProject(user: AuthUser, programmeId: string): boolean {
  return (
    hasRoleInProgramme(user, "admin", programmeId) ||
    hasRoleInProgramme(user, "program_coordinator", programmeId) ||
    hasRoleInProgramme(user, "lecturer", programmeId) ||
    hasRoleInProgramme(user, "student", programmeId)
  );
}

export function canWriteOwnSupervisorProfile(user: AuthUser, programmeId: string): boolean {
  return hasRoleInProgramme(user, "lecturer", programmeId);
}

export function canManageFinalProject(user: AuthUser, programmeId: string): boolean {
  return (
    hasRoleInProgramme(user, "admin", programmeId) ||
    hasRoleInProgramme(user, "program_coordinator", programmeId)
  );
}
''',
)

write(
    "apps/backend/src/plugins/final-project/service.ts",
    r'''import { Prisma } from "@prisma/client";
import type {
  FinalProjectSupervisorOverview,
  FinalProjectSupervisorProfile,
  UpsertFinalProjectSupervisorProfileInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

const profileInclude = {
  lecturer: {
    select: {
      id: true,
      name: true,
      honorific: true,
      title: true,
      qualification: true,
      lecturerProfile: { select: { fieldOfSpecialization: true } },
    },
  },
  tracks: {
    orderBy: { sortOrder: "asc" as const },
    include: { ideas: { orderBy: { sortOrder: "asc" as const } } },
  },
} satisfies Prisma.FinalProjectSupervisorProfileInclude;

type SupervisorProfileRow = Prisma.FinalProjectSupervisorProfileGetPayload<{
  include: typeof profileInclude;
}>;

async function currentLoad(lecturerUserId: string, programmeId: string): Promise<number> {
  return prisma.studentPortfolioSupervisorRelationship.count({
    where: {
      supervisorUserId: lecturerUserId,
      status: "Approved",
      student: {
        cohortMemberships: {
          some: {
            exitedAt: null,
            cohort: { programmeId },
          },
        },
      },
    },
  });
}

function toContract(row: SupervisorProfileRow, load: number): FinalProjectSupervisorProfile {
  return {
    id: row.id,
    programmeId: row.programmeId,
    lecturer: {
      id: row.lecturer.id,
      name: row.lecturer.name,
      honorific: row.lecturer.honorific ?? null,
      academicPosition: row.lecturer.title ?? null,
      qualification: row.lecturer.qualification ?? null,
      fieldOfSpecialization: row.lecturer.lecturerProfile?.fieldOfSpecialization ?? null,
    },
    statement: row.statement,
    capacity: row.capacity,
    currentLoad: load,
    availableSlots: Math.max(0, row.capacity - load),
    acceptingStudents: row.acceptingStudents,
    isPublished: row.isPublished,
    tracks: row.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      description: track.description,
      sortOrder: track.sortOrder,
      ideas: track.ideas.map((idea) => ({
        id: idea.id,
        title: idea.title,
        summary: idea.summary,
        skills: idea.skills,
        sortOrder: idea.sortOrder,
      })),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function hydrate(rows: SupervisorProfileRow[]): Promise<FinalProjectSupervisorProfile[]> {
  const loads = await Promise.all(
    rows.map((row) => currentLoad(row.lecturerUserId, row.programmeId)),
  );
  return rows.map((row, index) => toContract(row, loads[index] ?? 0));
}

export const finalProjectService = {
  async getOwnProfile(
    lecturerUserId: string,
    programmeId: string,
  ): Promise<FinalProjectSupervisorProfile | null> {
    const row = await prisma.finalProjectSupervisorProfile.findUnique({
      where: { programmeId_lecturerUserId: { programmeId, lecturerUserId } },
      include: profileInclude,
    });
    if (!row) return null;
    return toContract(row, await currentLoad(lecturerUserId, programmeId));
  },

  async upsertOwnProfile(
    lecturerUserId: string,
    programmeId: string,
    input: UpsertFinalProjectSupervisorProfileInput,
  ): Promise<FinalProjectSupervisorProfile> {
    const existing = await prisma.finalProjectSupervisorProfile.findUnique({
      where: { programmeId_lecturerUserId: { programmeId, lecturerUserId } },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      const profile = await tx.finalProjectSupervisorProfile.upsert({
        where: { programmeId_lecturerUserId: { programmeId, lecturerUserId } },
        update: {
          statement: input.statement,
          capacity: input.capacity,
          acceptingStudents: input.acceptingStudents,
          isPublished: input.isPublished,
        },
        create: {
          programmeId,
          lecturerUserId,
          statement: input.statement,
          capacity: input.capacity,
          acceptingStudents: input.acceptingStudents,
          isPublished: input.isPublished,
        },
      });

      await tx.finalProjectResearchTrack.deleteMany({
        where: { supervisorProfileId: profile.id },
      });

      for (const [trackIndex, track] of input.tracks.entries()) {
        await tx.finalProjectResearchTrack.create({
          data: {
            supervisorProfileId: profile.id,
            title: track.title,
            description: track.description,
            sortOrder: trackIndex,
            ideas: {
              create: track.ideas.map((idea, ideaIndex) => ({
                title: idea.title,
                summary: idea.summary,
                skills: idea.skills,
                sortOrder: ideaIndex,
              })),
            },
          },
        });
      }

      await tx.finalProjectSupervisorProfileAudit.create({
        data: {
          supervisorProfileId: profile.id,
          actorId: lecturerUserId,
          action: existing ? "Updated" : "Created",
          snapshot: input,
        },
      });
    });

    const updated = await this.getOwnProfile(lecturerUserId, programmeId);
    if (!updated) throw new Error("Supervisor profile was not persisted");
    return updated;
  },

  async listDiscovery(programmeId: string): Promise<FinalProjectSupervisorProfile[]> {
    const rows = await prisma.finalProjectSupervisorProfile.findMany({
      where: { programmeId, isPublished: true },
      include: profileInclude,
      orderBy: { lecturer: { name: "asc" } },
    });
    return hydrate(rows);
  },

  async overview(programmeId: string): Promise<FinalProjectSupervisorOverview> {
    const rows = await prisma.finalProjectSupervisorProfile.findMany({
      where: { programmeId },
      include: profileInclude,
      orderBy: { lecturer: { name: "asc" } },
    });
    const supervisors = await hydrate(rows);
    return {
      programmeId,
      totalSupervisors: supervisors.length,
      publishedSupervisors: supervisors.filter((profile) => profile.isPublished).length,
      acceptingSupervisors: supervisors.filter((profile) => profile.acceptingStudents).length,
      totalCapacity: supervisors.reduce((sum, profile) => sum + profile.capacity, 0),
      currentLoad: supervisors.reduce((sum, profile) => sum + profile.currentLoad, 0),
      availableSlots: supervisors.reduce((sum, profile) => sum + profile.availableSlots, 0),
      supervisors,
    };
  },
};

export type FinalProjectService = typeof finalProjectService;
''',
)

write(
    "apps/backend/src/plugins/final-project/router.ts",
    r'''import { Router, type NextFunction, type Request, type Response } from "express";
import { UpsertFinalProjectSupervisorProfileInput } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import type { AuthUser } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import {
  canManageFinalProject,
  canReadFinalProject,
  canWriteOwnSupervisorProfile,
} from "./scope.ts";
import { finalProjectService } from "./service.ts";

type ScopeCheck = (user: AuthUser, programmeId: string) => boolean;

function requireScope(check: ScopeCheck, message: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!check(user, DEFAULT_PROGRAMME_ID)) {
      res.status(403).json({ error: message });
      return;
    }
    next();
  };
}

export function createFinalProjectRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/discovery",
    requirePermission("final-project:read"),
    requireScope(canReadFinalProject, "Final Project access is not available in this programme"),
    async (_req, res, next) => {
      try {
        res.json(await finalProjectService.listDiscovery(DEFAULT_PROGRAMME_ID));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/me",
    requirePermission("final-project:write"),
    requireScope(canWriteOwnSupervisorProfile, "Lecturer role is required in this programme"),
    async (req, res, next) => {
      try {
        res.json(await finalProjectService.getOwnProfile(req.user!.id, DEFAULT_PROGRAMME_ID));
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/me",
    requirePermission("final-project:write"),
    requireScope(canWriteOwnSupervisorProfile, "Lecturer role is required in this programme"),
    async (req, res, next) => {
      const parsed = UpsertFinalProjectSupervisorProfileInput.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      try {
        res.json(
          await finalProjectService.upsertOwnProfile(
            req.user!.id,
            DEFAULT_PROGRAMME_ID,
            parsed.data,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/overview",
    requirePermission("final-project:manage"),
    requireScope(canManageFinalProject, "Programme final-project management access is required"),
    async (_req, res, next) => {
      try {
        res.json(await finalProjectService.overview(DEFAULT_PROGRAMME_ID));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
''',
)

write(
    "apps/backend/src/plugins/final-project/index.ts",
    r'''import { finalProjectManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createFinalProjectRouter } from "./router.ts";
import { finalProjectService, type FinalProjectService } from "./service.ts";

export const finalProjectPlugin: BackendPlugin<FinalProjectService> = {
  manifest: finalProjectManifest,
  router: createFinalProjectRouter(),
  service: finalProjectService,
};
''',
)

write(
    "apps/backend/src/plugins/final-project/scope.test.ts",
    r'''import { describe, expect, test } from "bun:test";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import {
  canManageFinalProject,
  canReadFinalProject,
  canWriteOwnSupervisorProfile,
} from "./scope.ts";

function user(role: Role, programmeId: string | null): AuthUser {
  return {
    id: `${role}-test-user`,
    email: `${role}@example.test`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("final project programme scope", () => {
  test("student and lecturer reads stay inside their assigned programme", () => {
    expect(canReadFinalProject(user("student", "dse"), "dse")).toBe(true);
    expect(canReadFinalProject(user("student", "other"), "dse")).toBe(false);
    expect(canReadFinalProject(user("lecturer", "dse"), "dse")).toBe(true);
    expect(canReadFinalProject(user("lecturer", "other"), "dse")).toBe(false);
  });

  test("only an in-programme lecturer can edit an own supervisor profile", () => {
    expect(canWriteOwnSupervisorProfile(user("lecturer", "dse"), "dse")).toBe(true);
    expect(canWriteOwnSupervisorProfile(user("lecturer", "other"), "dse")).toBe(false);
    expect(canWriteOwnSupervisorProfile(user("student", "dse"), "dse")).toBe(false);
  });

  test("programme coordinators manage only their programme while global admin manages all", () => {
    expect(canManageFinalProject(user("program_coordinator", "dse"), "dse")).toBe(true);
    expect(canManageFinalProject(user("program_coordinator", "other"), "dse")).toBe(false);
    expect(canManageFinalProject(user("admin", null), "dse")).toBe(true);
    expect(canManageFinalProject(user("lecturer", "dse"), "dse")).toBe(false);
  });
});
''',
)

# ---------------------------------------------------------------------------
# Safe additive SQL migration + security posture + immutable audit trigger
# ---------------------------------------------------------------------------
write(
    "apps/backend/prisma/migrations/20260910173000_add_final_project_supervisor_discovery/migration.sql",
    r'''CREATE TABLE "FinalProjectSupervisorProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "programmeId" TEXT NOT NULL,
  "lecturerUserId" TEXT NOT NULL,
  "statement" TEXT NOT NULL DEFAULT '',
  "capacity" INTEGER NOT NULL DEFAULT 0,
  "acceptingStudents" BOOLEAN NOT NULL DEFAULT false,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinalProjectSupervisorProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalProjectSupervisorProfile_capacity_check" CHECK ("capacity" >= 0 AND "capacity" <= 20),
  CONSTRAINT "FinalProjectSupervisorProfile_accepting_capacity_check" CHECK (NOT "acceptingStudents" OR "capacity" > 0),
  CONSTRAINT "FinalProjectSupervisorProfile_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinalProjectSupervisorProfile_lecturerUserId_fkey" FOREIGN KEY ("lecturerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinalProjectSupervisorProfile_programmeId_lecturerUserId_key"
  ON "FinalProjectSupervisorProfile"("programmeId", "lecturerUserId");
CREATE INDEX "FinalProjectSupervisorProfile_programmeId_isPublished_acceptingStudents_idx"
  ON "FinalProjectSupervisorProfile"("programmeId", "isPublished", "acceptingStudents");
CREATE INDEX "FinalProjectSupervisorProfile_lecturerUserId_idx"
  ON "FinalProjectSupervisorProfile"("lecturerUserId");

CREATE TABLE "FinalProjectResearchTrack" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "supervisorProfileId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinalProjectResearchTrack_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalProjectResearchTrack_supervisorProfileId_fkey" FOREIGN KEY ("supervisorProfileId") REFERENCES "FinalProjectSupervisorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinalProjectResearchTrack_supervisorProfileId_title_key"
  ON "FinalProjectResearchTrack"("supervisorProfileId", "title");
CREATE INDEX "FinalProjectResearchTrack_supervisorProfileId_sortOrder_idx"
  ON "FinalProjectResearchTrack"("supervisorProfileId", "sortOrder");

CREATE TABLE "FinalProjectProjectIdea" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "researchTrackId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinalProjectProjectIdea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalProjectProjectIdea_researchTrackId_fkey" FOREIGN KEY ("researchTrackId") REFERENCES "FinalProjectResearchTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinalProjectProjectIdea_researchTrackId_title_key"
  ON "FinalProjectProjectIdea"("researchTrackId", "title");
CREATE INDEX "FinalProjectProjectIdea_researchTrackId_sortOrder_idx"
  ON "FinalProjectProjectIdea"("researchTrackId", "sortOrder");

CREATE TABLE "FinalProjectSupervisorProfileAudit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "supervisorProfileId" UUID NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinalProjectSupervisorProfileAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalProjectSupervisorProfileAudit_supervisorProfileId_fkey" FOREIGN KEY ("supervisorProfileId") REFERENCES "FinalProjectSupervisorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinalProjectSupervisorProfileAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "FinalProjectSupervisorProfileAudit_supervisorProfileId_createdAt_idx"
  ON "FinalProjectSupervisorProfileAudit"("supervisorProfileId", "createdAt");
CREATE INDEX "FinalProjectSupervisorProfileAudit_actorId_createdAt_idx"
  ON "FinalProjectSupervisorProfileAudit"("actorId", "createdAt");

CREATE FUNCTION public.prevent_final_project_supervisor_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'FinalProjectSupervisorProfileAudit is append-only';
END;
$$;

CREATE TRIGGER "FinalProjectSupervisorProfileAudit_append_only"
BEFORE UPDATE OR DELETE ON "FinalProjectSupervisorProfileAudit"
FOR EACH ROW EXECUTE FUNCTION public.prevent_final_project_supervisor_audit_mutation();

DO $$
DECLARE
  table_name text;
  api_role text;
  protected_tables constant text[] := ARRAY[
    'FinalProjectSupervisorProfile',
    'FinalProjectResearchTrack',
    'FinalProjectProjectIdea',
    'FinalProjectSupervisorProfileAudit'
  ];
BEGIN
  FOREACH table_name IN ARRAY protected_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
  END LOOP;

  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    FOREACH table_name IN ARRAY protected_tables LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, api_role);
    END LOOP;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_final_project_supervisor_audit_mutation() FROM %I',
      api_role
    );
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_final_project_supervisor_audit_mutation() FROM PUBLIC;
''',
)

# ---------------------------------------------------------------------------
# Shared contract tests
# ---------------------------------------------------------------------------
write(
    "packages/shared-types/src/final-project.test.ts",
    r'''import { describe, expect, test } from "bun:test";
import { UpsertFinalProjectSupervisorProfileInput } from "./final-project.ts";

describe("final project supervisor profile contract", () => {
  test("accepts a bounded, normalized supervisor discovery profile", () => {
    const result = UpsertFinalProjectSupervisorProfileInput.safeParse({
      statement: "I supervise applied AI projects with regular check-ins.",
      capacity: 4,
      acceptingStudents: true,
      isPublished: true,
      tracks: [
        {
          title: "AI for Agriculture",
          description: "Applied ML for Cambodian agriculture.",
          ideas: [
            {
              title: "Crop stress detection",
              summary: "Explore image and sensor signals.",
              skills: ["Python", "Machine Learning"],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects impossible availability and duplicate track names", () => {
    const zeroCapacity = UpsertFinalProjectSupervisorProfileInput.safeParse({
      statement: "",
      capacity: 0,
      acceptingStudents: true,
      isPublished: false,
      tracks: [],
    });
    expect(zeroCapacity.success).toBe(false);

    const duplicateTracks = UpsertFinalProjectSupervisorProfileInput.safeParse({
      statement: "",
      capacity: 2,
      acceptingStudents: false,
      isPublished: false,
      tracks: [
        { title: "Khmer AI", description: "", ideas: [] },
        { title: "khmer ai", description: "", ideas: [] },
      ],
    });
    expect(duplicateTracks.success).toBe(false);
  });
});
''',
)

# ---------------------------------------------------------------------------
# Frontend API + role-aware MVP screen
# ---------------------------------------------------------------------------
write(
    "apps/frontend/lib/final-project.ts",
    r'''import type {
  FinalProjectSupervisorOverview,
  FinalProjectSupervisorProfile,
  UpsertFinalProjectSupervisorProfileInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const finalProjectApi = {
  discovery(): Promise<FinalProjectSupervisorProfile[]> {
    return api.get<FinalProjectSupervisorProfile[]>("/api/final-project/discovery");
  },
  me(): Promise<FinalProjectSupervisorProfile | null> {
    return api.get<FinalProjectSupervisorProfile | null>("/api/final-project/me");
  },
  updateMe(
    input: UpsertFinalProjectSupervisorProfileInput,
  ): Promise<FinalProjectSupervisorProfile> {
    return api.put<FinalProjectSupervisorProfile>("/api/final-project/me", input);
  },
  overview(): Promise<FinalProjectSupervisorOverview> {
    return api.get<FinalProjectSupervisorOverview>("/api/final-project/overview");
  },
};
''',
)

write(
    "apps/frontend/app/(shell)/final-project/page.tsx",
    r'''import { Topbar } from "../topbar";
import { FinalProjectClient } from "./final-project-client";

export default function FinalProjectPage() {
  return (
    <>
      <Topbar
        title="Final Project"
        subtitle="Discover supervision fit, publish research directions, and see programme capacity"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FinalProjectClient />
      </main>
    </>
  );
}
''',
)

write(
    "apps/frontend/app/(shell)/final-project/final-project-client.tsx",
    r'''"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  FinalProjectSupervisorOverview,
  FinalProjectSupervisorProfile,
  UpsertFinalProjectSupervisorProfileInput,
} from "@dse-pms/shared-types";
import { Button, FormFieldLabel, Input } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { finalProjectApi } from "@/lib/final-project";

const EMPTY_FORM: UpsertFinalProjectSupervisorProfileInput = {
  statement: "",
  capacity: 0,
  acceptingStudents: false,
  isPublished: false,
  tracks: [],
};

export function FinalProjectClient() {
  const { me, loading: meLoading } = useMe();
  const [profiles, setProfiles] = useState<FinalProjectSupervisorProfile[]>([]);
  const [overview, setOverview] = useState<FinalProjectSupervisorOverview | null>(null);
  const [form, setForm] = useState<UpsertFinalProjectSupervisorProfileInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyAccepting, setOnlyAccepting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let active = true;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const discovery = await finalProjectApi.discovery();
        if (!active) return;
        setProfiles(discovery);

        if (me.roles.includes("lecturer")) {
          const own = await finalProjectApi.me();
          if (!active) return;
          setForm(own ? toForm(own) : EMPTY_FORM);
        }

        if (me.roles.includes("admin") || me.roles.includes("program_coordinator")) {
          const programmeOverview = await finalProjectApi.overview();
          if (!active) return;
          setOverview(programmeOverview);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Could not load Final Project information");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [me]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return profiles.filter((profile) => {
      if (onlyAccepting && !(profile.acceptingStudents && profile.availableSlots > 0)) return false;
      if (!query) return true;
      const searchable = [
        profile.lecturer.name,
        profile.lecturer.academicPosition ?? "",
        profile.lecturer.qualification ?? "",
        profile.lecturer.fieldOfSpecialization ?? "",
        profile.statement,
        ...profile.tracks.flatMap((track) => [
          track.title,
          track.description,
          ...track.ideas.flatMap((idea) => [idea.title, idea.summary, ...idea.skills]),
        ]),
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(query);
    });
  }, [onlyAccepting, profiles, search]);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;
  const isLecturer = me?.roles.includes("lecturer") ?? false;
  const isManager = me?.roles.some((role) => role === "admin" || role === "program_coordinator") ?? false;

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await finalProjectApi.updateMe(form);
      setForm(toForm(updated));
      const [discovery, programmeOverview] = await Promise.all([
        finalProjectApi.discovery(),
        isManager ? finalProjectApi.overview() : Promise.resolve(null),
      ]);
      setProfiles(discovery);
      if (programmeOverview) setOverview(programmeOverview);
      setMessage("Supervisor discovery profile saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save supervisor profile");
    } finally {
      setSaving(false);
    }
  }

  if (meLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading Final Project workspace…</p>;
  }

  if (!me) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {message ? (
        <p className="rounded-lg border border-status-live/30 bg-status-live-bg p-3 text-sm text-status-live">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isManager && overview ? <ProgrammeOverview overview={overview} /> : null}
      {isLecturer ? (
        <SupervisorEditor form={form} setForm={setForm} saving={saving} onSubmit={saveProfile} />
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Find a supervisor</h2>
            <p className="text-sm text-muted-foreground">
              Browse published supervision areas and example project directions. Applications are a later phase.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search AI, agriculture, LLM…"
              aria-label="Search supervisors"
            />
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-foreground">
              <input
                type="checkbox"
                checked={onlyAccepting}
                onChange={(event) => setOnlyAccepting(event.target.checked)}
              />
              Open only
            </label>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="font-medium text-foreground">No matching published supervisors yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lecturers can publish their supervision profile from this workspace.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((profile) => (
              <SupervisorCard
                key={profile.id}
                profile={profile}
                onOpen={() => setSelectedId(profile.id)}
              />
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <SupervisorDetail profile={selected} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}

function ProgrammeOverview({ overview }: { overview: FinalProjectSupervisorOverview }) {
  const stats = [
    ["Profiles", overview.totalSupervisors],
    ["Published", overview.publishedSupervisors],
    ["Accepting", overview.acceptingSupervisors],
    ["Capacity", overview.totalCapacity],
    ["Current load", overview.currentLoad],
    ["Open slots", overview.availableSlots],
  ] as const;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold text-foreground">Programme supervision overview</h2>
        <p className="text-sm text-muted-foreground">Read-only capacity view for programme coordination.</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SupervisorCard({
  profile,
  onOpen,
}: {
  profile: FinalProjectSupervisorProfile;
  onOpen: () => void;
}) {
  const open = profile.acceptingStudents && profile.availableSlots > 0;
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{displayName(profile)}</h3>
          <p className="text-sm text-muted-foreground">
            {profile.lecturer.fieldOfSpecialization ?? profile.lecturer.academicPosition ?? "DSE Lecturer"}
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
          {open ? "Accepting" : profile.acceptingStudents ? "Full" : "Not accepting"}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
        {profile.statement || "Open the profile to see research tracks and project directions."}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {profile.tracks.slice(0, 4).map((track) => (
          <span key={track.id} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">
            {track.title}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span className="text-xs text-muted-foreground">
          {profile.currentLoad}/{profile.capacity} supervised · {profile.availableSlots} open
        </span>
        <Button type="button" onClick={onOpen}>View profile</Button>
      </div>
    </article>
  );
}

function SupervisorDetail({
  profile,
  onClose,
}: {
  profile: FinalProjectSupervisorProfile;
  onClose: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supervisor profile</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">{displayName(profile)}</h2>
          <p className="text-sm text-muted-foreground">
            {[profile.lecturer.academicPosition, profile.lecturer.qualification].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" className="text-sm font-medium text-muted-foreground hover:text-foreground" onClick={onClose}>
          Close
        </button>
      </div>
      {profile.statement ? <p className="mt-4 max-w-3xl text-sm leading-6 text-foreground">{profile.statement}</p> : null}
      <p className="mt-3 text-sm text-muted-foreground">
        Capacity: {profile.currentLoad}/{profile.capacity} · {profile.availableSlots} open slot(s)
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {profile.tracks.map((track) => (
          <div key={track.id} className="rounded-lg border border-border p-4">
            <h3 className="font-semibold text-foreground">{track.title}</h3>
            {track.description ? <p className="mt-1 text-sm text-muted-foreground">{track.description}</p> : null}
            {track.ideas.length > 0 ? (
              <div className="mt-3 space-y-3">
                {track.ideas.map((idea) => (
                  <div key={idea.id}>
                    <p className="text-sm font-medium text-foreground">{idea.title}</p>
                    {idea.summary ? <p className="text-xs text-muted-foreground">{idea.summary}</p> : null}
                    {idea.skills.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">Skills: {idea.skills.join(", ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function SupervisorEditor({
  form,
  setForm,
  saving,
  onSubmit,
}: {
  form: UpsertFinalProjectSupervisorProfileInput;
  setForm: React.Dispatch<React.SetStateAction<UpsertFinalProjectSupervisorProfileInput>>;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
}) {
  function updateTrack(index: number, field: "title" | "description", value: string) {
    setForm((current) => ({
      ...current,
      tracks: current.tracks.map((track, trackIndex) =>
        trackIndex === index ? { ...track, [field]: value } : track,
      ),
    }));
  }

  function updateIdea(
    trackIndex: number,
    ideaIndex: number,
    field: "title" | "summary" | "skills",
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      tracks: current.tracks.map((track, currentTrackIndex) => {
        if (currentTrackIndex !== trackIndex) return track;
        return {
          ...track,
          ideas: track.ideas.map((idea, currentIdeaIndex) => {
            if (currentIdeaIndex !== ideaIndex) return idea;
            return {
              ...idea,
              [field]: field === "skills"
                ? value.split(",").map((skill) => skill.trim()).filter(Boolean)
                : value,
            };
          }),
        };
      }),
    }));
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div>
        <h2 className="font-semibold text-foreground">My supervisor profile</h2>
        <p className="text-sm text-muted-foreground">
          Publish only information students need to judge supervision fit. This does not assign any student.
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-5 space-y-5">
        <label className="block space-y-1.5">
          <FormFieldLabel>Supervision statement</FormFieldLabel>
          <textarea
            value={form.statement}
            onChange={(event) => setForm((current) => ({ ...current, statement: event.target.value }))}
            rows={4}
            maxLength={4000}
            placeholder="What kinds of students/projects do you supervise? What working style should students expect?"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <FormFieldLabel>Maximum students</FormFieldLabel>
            <Input
              type="number"
              min={0}
              max={20}
              step={1}
              value={form.capacity}
              onChange={(event) => setForm((current) => ({
                ...current,
                capacity: Number(event.target.value),
                acceptingStudents: Number(event.target.value) > 0 ? current.acceptingStudents : false,
              }))}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.acceptingStudents}
              disabled={form.capacity === 0}
              onChange={(event) => setForm((current) => ({ ...current, acceptingStudents: event.target.checked }))}
            />
            Accepting students
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))}
            />
            Visible to students
          </label>
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Research tracks & example ideas</h3>
              <p className="text-xs text-muted-foreground">Examples guide discovery; they are not approved proposals.</p>
            </div>
            <button
              type="button"
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => setForm((current) => ({
                ...current,
                tracks: [...current.tracks, { title: "", description: "", ideas: [] }],
              }))}
            >
              + Add track
            </button>
          </div>

          {form.tracks.map((track, trackIndex) => (
            <div key={trackIndex} className="space-y-3 rounded-lg border border-border bg-background p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={track.title}
                  onChange={(event) => updateTrack(trackIndex, "title", event.target.value)}
                  placeholder="Research track, e.g. AI for Agriculture"
                  required
                />
                <Input
                  value={track.description}
                  onChange={(event) => updateTrack(trackIndex, "description", event.target.value)}
                  placeholder="Short description"
                />
              </div>

              {track.ideas.map((idea, ideaIndex) => (
                <div key={ideaIndex} className="grid gap-2 border-l-2 border-border pl-3 sm:grid-cols-3">
                  <Input
                    value={idea.title}
                    onChange={(event) => updateIdea(trackIndex, ideaIndex, "title", event.target.value)}
                    placeholder="Example project idea"
                    required
                  />
                  <Input
                    value={idea.summary}
                    onChange={(event) => updateIdea(trackIndex, ideaIndex, "summary", event.target.value)}
                    placeholder="Short direction"
                  />
                  <Input
                    value={idea.skills.join(", ")}
                    onChange={(event) => updateIdea(trackIndex, ideaIndex, "skills", event.target.value)}
                    placeholder="Skills, comma separated"
                  />
                </div>
              ))}

              <div className="flex flex-wrap gap-4 text-sm">
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={() => setForm((current) => ({
                    ...current,
                    tracks: current.tracks.map((currentTrack, currentTrackIndex) =>
                      currentTrackIndex === trackIndex
                        ? {
                            ...currentTrack,
                            ideas: [...currentTrack.ideas, { title: "", summary: "", skills: [] }],
                          }
                        : currentTrack,
                    ),
                  }))}
                >
                  + Add idea
                </button>
                <button
                  type="button"
                  className="font-medium text-destructive underline-offset-4 hover:underline"
                  onClick={() => setForm((current) => ({
                    ...current,
                    tracks: current.tracks.filter((_, currentTrackIndex) => currentTrackIndex !== trackIndex),
                  }))}
                >
                  Remove track
                </button>
              </div>
            </div>
          ))}
        </div>

        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save supervisor profile"}</Button>
      </form>
    </section>
  );
}

function toForm(profile: FinalProjectSupervisorProfile): UpsertFinalProjectSupervisorProfileInput {
  return {
    statement: profile.statement,
    capacity: profile.capacity,
    acceptingStudents: profile.acceptingStudents,
    isPublished: profile.isPublished,
    tracks: profile.tracks.map((track) => ({
      title: track.title,
      description: track.description,
      ideas: track.ideas.map((idea) => ({
        title: idea.title,
        summary: idea.summary,
        skills: idea.skills,
      })),
    })),
  };
}

function displayName(profile: FinalProjectSupervisorProfile): string {
  return [profile.lecturer.honorific, profile.lecturer.name].filter(Boolean).join(" ");
}
''',
)

# ---------------------------------------------------------------------------
# End-to-end authorization integration test and CI discovery
# ---------------------------------------------------------------------------
write(
    "apps/backend/src/integration/final-project-supervisor-discovery.integration.test.ts",
    r'''import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { AuthUser, Role } from "../core/auth/token.ts";
import { signToken } from "../core/auth/token.ts";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;
const TEST_SECRET = "final-project-integration-secret-at-least-32-characters";

type HttpResult = { status: number; body: unknown };
type ProfileResponse = {
  id: string;
  lecturer: { id: string; name: string };
  capacity: number;
  currentLoad: number;
  availableSlots: number;
  acceptingStudents: boolean;
  isPublished: boolean;
  tracks: Array<{ title: string; ideas: Array<{ title: string }> }>;
};

integrationDescribe("final project supervisor discovery authorization", () => {
  let server: Server;
  let baseUrl = "";
  let lecturer: AuthUser;
  let coordinator: AuthUser;
  let student: AuthUser;
  let auditId = "";

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;
    [lecturer, coordinator, student] = await Promise.all([
      loadAuthUser("lecturer@dse.dev"),
      loadAuthUser("coordinator@dse.dev"),
      loadAuthUser("student@dse.dev"),
    ]);

    const app: Express = createApp();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await prisma.$disconnect();
  });

  test("lecturer ownership, publication boundary, programme scope, and audit immutability hold end to end", async () => {
    const studentWrite = await request("/api/final-project/me", {
      method: "PUT",
      token: signToken(student),
      body: supervisorInput(true),
    });
    expect(studentWrite.status).toBe(403);

    const crossProgrammeLecturer: AuthUser = {
      ...lecturer,
      programmeRoles: [{ role: "lecturer", programmeId: "other-programme" }],
    };
    const crossProgrammeWrite = await request("/api/final-project/me", {
      method: "PUT",
      token: signToken(crossProgrammeLecturer),
      body: supervisorInput(true),
    });
    expect(crossProgrammeWrite.status).toBe(403);

    const saved = await request("/api/final-project/me", {
      method: "PUT",
      token: signToken(lecturer),
      body: supervisorInput(true),
    });
    expect(saved.status).toBe(200);
    const profile = saved.body as ProfileResponse;
    expect(profile.lecturer.id).toBe(lecturer.id);
    expect(profile.isPublished).toBe(true);
    expect(profile.capacity).toBe(3);
    expect(profile.availableSlots).toBe(3);
    expect(profile.tracks[0]?.title).toBe("AI for Agriculture");

    const discovery = await request("/api/final-project/discovery", {
      token: signToken(student),
    });
    expect(discovery.status).toBe(200);
    const published = discovery.body as ProfileResponse[];
    expect(published.some((entry) => entry.lecturer.id === lecturer.id)).toBe(true);

    const hidden = await request("/api/final-project/me", {
      method: "PUT",
      token: signToken(lecturer),
      body: supervisorInput(false),
    });
    expect(hidden.status).toBe(200);
    const discoveryAfterUnpublish = await request("/api/final-project/discovery", {
      token: signToken(student),
    });
    expect((discoveryAfterUnpublish.body as ProfileResponse[]).some(
      (entry) => entry.lecturer.id === lecturer.id,
    )).toBe(false);

    const studentOverview = await request("/api/final-project/overview", {
      token: signToken(student),
    });
    expect(studentOverview.status).toBe(403);

    const crossProgrammeCoordinator: AuthUser = {
      ...coordinator,
      programmeRoles: [{ role: "program_coordinator", programmeId: "other-programme" }],
    };
    const wrongProgrammeOverview = await request("/api/final-project/overview", {
      token: signToken(crossProgrammeCoordinator),
    });
    expect(wrongProgrammeOverview.status).toBe(403);

    const overview = await request("/api/final-project/overview", {
      token: signToken(coordinator),
    });
    expect(overview.status).toBe(200);
    expect((overview.body as { totalSupervisors: number }).totalSupervisors).toBeGreaterThanOrEqual(1);

    const audit = await prisma.finalProjectSupervisorProfileAudit.findFirstOrThrow({
      where: { actorId: lecturer.id },
      orderBy: { createdAt: "desc" },
    });
    auditId = audit.id;
    await expectDatabaseRejection(() => prisma.$executeRaw`
      UPDATE "FinalProjectSupervisorProfileAudit"
      SET "action" = 'Tampered'
      WHERE "id" = ${audit.id}::uuid
    `);
    await expectDatabaseRejection(() => prisma.$executeRaw`
      DELETE FROM "FinalProjectSupervisorProfileAudit"
      WHERE "id" = ${audit.id}::uuid
    `);
  });

  async function request(
    path: string,
    options: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<HttpResult> {
    const headers = new Headers();
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    if (options.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
});

function supervisorInput(isPublished: boolean) {
  return {
    statement: "Applied AI supervision with regular check-ins and direct feedback.",
    capacity: 3,
    acceptingStudents: true,
    isPublished,
    tracks: [
      {
        title: "AI for Agriculture",
        description: "Machine learning and data systems for agricultural problems.",
        ideas: [
          {
            title: "Crop condition monitoring",
            summary: "Combine environmental and plant observations for useful predictions.",
            skills: ["Python", "Machine Learning"],
          },
        ],
      },
    ],
  };
}

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  const roles = user.roleAssignments.map((assignment) => assignment.role.slug as Role);
  if (roles.length === 0) throw new Error(`Seeded integration user ${email} has no roles`);
  return {
    id: user.id,
    email: user.email,
    roles,
    programmeRoles: user.roleAssignments.map((assignment) => ({
      role: assignment.role.slug as Role,
      programmeId: assignment.programmeId,
    })),
  };
}

async function expectDatabaseRejection(operation: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}
''',
)

# avoid linting an assigned-only test cleanup variable
replace_once(
    "apps/backend/src/integration/final-project-supervisor-discovery.integration.test.ts",
    '  let auditId = "";\n',
    '',
)
replace_once(
    "apps/backend/src/integration/final-project-supervisor-discovery.integration.test.ts",
    '    auditId = audit.id;\n',
    '',
)

replace_once(
    "package.json",
    '&& bun test apps/backend/src/integration/lecturer-portfolio.integration.test.ts",',
    '&& bun test apps/backend/src/integration/lecturer-portfolio.integration.test.ts '
    '&& bun test apps/backend/src/integration/final-project-supervisor-discovery.integration.test.ts",',
)

# Remove bootstrap-only automation from the resulting feature diff.
(ROOT / ".github/workflows/issue-1006-bootstrap.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
