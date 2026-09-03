from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"anchor not found in {path}: expected >= {count}, got {actual}: {old[:120]!r}")
    text = text.replace(old, new, count)
    p.write_text(text)


def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)

# Prisma schema: reuse current ProgramCompetency catalogue, add immutable programme-scoped snapshots.
replace(
    "apps/backend/prisma/schema.prisma",
    '  curriculumAuditActions             ProgrammeCurriculumAuditAction[]          @relation("ProgrammeCurriculumAuditActor")\n',
    '  curriculumAuditActions             ProgrammeCurriculumAuditAction[]          @relation("ProgrammeCurriculumAuditActor")\n'
    '  competencyFrameworkVersionsCreated ProgrammeCompetencyFrameworkVersion[]     @relation("ProgrammeCompetencyFrameworkVersionCreatedBy")\n'
    '  competencyFrameworkAssignments     ProgrammeCurriculumVersion[]              @relation("ProgrammeCurriculumCompetencyFrameworkAssignedBy")\n',
)
replace(
    "apps/backend/prisma/schema.prisma",
    '  curricula                ProgrammeCurriculum[]\n',
    '  curricula                ProgrammeCurriculum[]\n  competencyFrameworks     ProgrammeCompetencyFramework[]\n',
)
replace(
    "apps/backend/prisma/schema.prisma",
    '/// Canonical curriculum identity for one programme. Versions are immutable\n',
    '''/// Stable programme-owned identity for a graduate competency framework. The\n/// mutable/current ProgramCompetency catalogue remains the authoring source; these\n/// framework versions snapshot that source for reproducible curriculum history.\nmodel ProgrammeCompetencyFramework {\n  id          String    @id @default(uuid())\n  programmeId String\n  programme   Programme @relation(fields: [programmeId], references: [id], onDelete: Restrict)\n  code        String\n  createdAt   DateTime  @default(now())\n\n  versions ProgrammeCompetencyFrameworkVersion[]\n\n  @@unique([programmeId, code])\n  @@index([programmeId])\n}\n\n/// Immutable snapshot of the programme competency/PLO design context. Corrections\n/// create a new framework version rather than rewriting historical snapshots.\nmodel ProgrammeCompetencyFrameworkVersion {\n  id          String                       @id @default(uuid())\n  frameworkId String\n  framework   ProgrammeCompetencyFramework @relation(fields: [frameworkId], references: [id], onDelete: Restrict)\n  version     Int\n  name        String\n  changeNote  String                       @default(\"\")\n  createdById String\n  createdBy   User                         @relation(\"ProgrammeCompetencyFrameworkVersionCreatedBy\", fields: [createdById], references: [id], onDelete: Restrict)\n  createdAt   DateTime                     @default(now())\n\n  competencies       ProgrammeCompetencyFrameworkCompetency[]\n  curriculumVersions ProgrammeCurriculumVersion[]\n\n  @@unique([frameworkId, version])\n  @@index([frameworkId])\n  @@index([createdById])\n}\n\n/// One competency copied from the canonical current ProgramCompetency catalogue\n/// into an immutable framework version, including the PLO codes applicable then.\nmodel ProgrammeCompetencyFrameworkCompetency {\n  id                 String                              @id @default(uuid())\n  frameworkVersionId String\n  frameworkVersion   ProgrammeCompetencyFrameworkVersion @relation(fields: [frameworkVersionId], references: [id], onDelete: Restrict)\n  code               String\n  name               String\n  description        String?\n  order              Int\n  sourceActive       Boolean                             @default(true)\n  ploCodes           String[]                            @default([])\n  createdAt          DateTime                            @default(now())\n\n  @@unique([frameworkVersionId, code])\n  @@unique([frameworkVersionId, order])\n  @@index([frameworkVersionId])\n}\n\n/// Canonical curriculum identity for one programme. Versions are immutable\n''',
)
replace(
    "apps/backend/prisma/schema.prisma",
    '  createdById      String\n  createdBy        User                                 @relation("ProgrammeCurriculumVersionCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)\n  createdAt        DateTime                             @default(now())\n',
    '  createdById      String\n  createdBy        User                                 @relation("ProgrammeCurriculumVersionCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)\n  competencyFrameworkVersionId String?\n  competencyFrameworkVersion   ProgrammeCompetencyFrameworkVersion? @relation(fields: [competencyFrameworkVersionId], references: [id], onDelete: Restrict)\n  competencyFrameworkAssignedById String?\n  competencyFrameworkAssignedBy   User? @relation("ProgrammeCurriculumCompetencyFrameworkAssignedBy", fields: [competencyFrameworkAssignedById], references: [id], onDelete: Restrict)\n  competencyFrameworkAssignedAt   DateTime?\n  createdAt        DateTime                             @default(now())\n',
)
replace(
    "apps/backend/prisma/schema.prisma",
    '  @@index([createdById])\n}\n\n/// A version-scoped mutually exclusive curriculum route.',
    '  @@index([createdById])\n  @@index([competencyFrameworkVersionId])\n  @@index([competencyFrameworkAssignedById])\n}\n\n/// A version-scoped mutually exclusive curriculum route.',
)

# Shared API contracts.
replace(
    "packages/shared-types/src/curriculum.ts",
    'export type CurriculumVersionSummary = z.infer<\n  typeof CurriculumVersionSummarySchema\n>;\n\nexport const ProgrammeCurriculumReadSchema = z.object({\n',
    '''export type CurriculumVersionSummary = z.infer<\n  typeof CurriculumVersionSummarySchema\n>;\n\nexport const ProgrammeCompetencyFrameworkCompetencySchema = z.object({\n  id: z.string().uuid(),\n  code: z.string(),\n  name: z.string(),\n  description: z.string().nullable(),\n  order: z.number().int(),\n  sourceActive: z.boolean(),\n  ploCodes: z.array(z.string()),\n});\nexport type ProgrammeCompetencyFrameworkCompetency = z.infer<\n  typeof ProgrammeCompetencyFrameworkCompetencySchema\n>;\n\nexport const ProgrammeCompetencyFrameworkVersionSchema = z.object({\n  frameworkId: z.string().uuid(),\n  programmeId: z.string(),\n  frameworkCode: z.string(),\n  frameworkVersionId: z.string().uuid(),\n  version: z.number().int().min(1),\n  name: z.string(),\n  changeNote: z.string(),\n  createdById: z.string().uuid(),\n  createdAt: z.string(),\n  competencies: z.array(ProgrammeCompetencyFrameworkCompetencySchema),\n});\nexport type ProgrammeCompetencyFrameworkVersion = z.infer<\n  typeof ProgrammeCompetencyFrameworkVersionSchema\n>;\n\nexport const CurriculumCompetencyFrameworkBindingSchema =\n  ProgrammeCompetencyFrameworkVersionSchema.extend({\n    assignedById: z.string().uuid(),\n    assignedAt: z.string(),\n  });\nexport type CurriculumCompetencyFrameworkBinding = z.infer<\n  typeof CurriculumCompetencyFrameworkBindingSchema\n>;\n\nexport const CreateProgrammeCompetencyFrameworkVersionSchema = z\n  .object({\n    code: z.string().trim().min(1).max(64),\n    name: z.string().trim().min(1).max(240),\n    changeNote: z.string().trim().max(2000).default(\"\"),\n  })\n  .strict();\nexport type CreateProgrammeCompetencyFrameworkVersionInput = z.infer<\n  typeof CreateProgrammeCompetencyFrameworkVersionSchema\n>;\n\nexport const BindProgrammeCurriculumCompetencyFrameworkSchema = z\n  .object({ frameworkVersionId: z.string().uuid() })\n  .strict();\nexport type BindProgrammeCurriculumCompetencyFrameworkInput = z.infer<\n  typeof BindProgrammeCurriculumCompetencyFrameworkSchema\n>;\n\nexport const ProgrammeCurriculumReadSchema = z.object({\n''',
)
replace(
    "packages/shared-types/src/curriculum.ts",
    '  selectedVersion: CurriculumVersionSummarySchema,\n  versions: z.array(CurriculumVersionSummarySchema),\n  years:',
    '  selectedVersion: CurriculumVersionSummarySchema,\n  versions: z.array(CurriculumVersionSummarySchema),\n  competencyFramework: CurriculumCompetencyFrameworkBindingSchema.nullable(),\n  years:',
)

# Backend snapshot/binding service.
write(
    "apps/backend/src/plugins/programme/competency-framework-service.ts",
    '''import { Prisma } from "@prisma/client";\nimport type {\n  CreateProgrammeCompetencyFrameworkVersionInput,\n  ProgrammeCompetencyFrameworkVersion,\n} from "@dse-pms/shared-types";\nimport { prisma } from "../../core/db/prisma.ts";\n\nconst frameworkVersionInclude = {\n  framework: { select: { id: true, programmeId: true, code: true } },\n  competencies: { orderBy: [{ order: "asc" as const }, { code: "asc" as const }] },\n} as const;\n\nfunction toFrameworkVersionView(version: {\n  id: string;\n  version: number;\n  name: string;\n  changeNote: string;\n  createdById: string;\n  createdAt: Date;\n  framework: { id: string; programmeId: string; code: string };\n  competencies: Array<{\n    id: string;\n    code: string;\n    name: string;\n    description: string | null;\n    order: number;\n    sourceActive: boolean;\n    ploCodes: string[];\n  }>;\n}): ProgrammeCompetencyFrameworkVersion {\n  return {\n    frameworkId: version.framework.id,\n    programmeId: version.framework.programmeId,\n    frameworkCode: version.framework.code,\n    frameworkVersionId: version.id,\n    version: version.version,\n    name: version.name,\n    changeNote: version.changeNote,\n    createdById: version.createdById,\n    createdAt: version.createdAt.toISOString(),\n    competencies: version.competencies.map((competency) => ({\n      id: competency.id,\n      code: competency.code,\n      name: competency.name,\n      description: competency.description,\n      order: competency.order,\n      sourceActive: competency.sourceActive,\n      ploCodes: [...competency.ploCodes].sort(),\n    })),\n  };\n}\n\nexport class CompetencyFrameworkNotFoundError extends Error {}\nexport class CompetencyFrameworkConflictError extends Error {}\nexport class InvalidCompetencyFrameworkAssignmentError extends Error {}\n\nexport const competencyFrameworkService = {\n  async listForProgramme(programmeId: string): Promise<ProgrammeCompetencyFrameworkVersion[]> {\n    const versions = await prisma.programmeCompetencyFrameworkVersion.findMany({\n      where: { framework: { programmeId } },\n      orderBy: [{ framework: { code: "asc" } }, { version: "desc" }],\n      include: frameworkVersionInclude,\n    });\n    return versions.map(toFrameworkVersionView);\n  },\n\n  async getById(frameworkVersionId: string): Promise<ProgrammeCompetencyFrameworkVersion> {\n    const version = await prisma.programmeCompetencyFrameworkVersion.findUnique({\n      where: { id: frameworkVersionId },\n      include: frameworkVersionInclude,\n    });\n    if (!version) throw new CompetencyFrameworkNotFoundError("Competency framework version not found");\n    return toFrameworkVersionView(version);\n  },\n\n  async createSnapshot(\n    programmeId: string,\n    actorId: string,\n    input: CreateProgrammeCompetencyFrameworkVersionInput,\n  ): Promise<ProgrammeCompetencyFrameworkVersion> {\n    const [programme, sourceCompetencies] = await Promise.all([\n      prisma.programme.findUnique({ where: { id: programmeId }, select: { id: true } }),\n      prisma.programCompetency.findMany({\n        where: { active: true },\n        orderBy: [{ order: "asc" }, { code: "asc" }],\n        include: {\n          ploLinks: { include: { plo: { select: { code: true } } } },\n        },\n      }),\n    ]);\n    if (!programme) throw new CompetencyFrameworkNotFoundError("Programme not found");\n    if (sourceCompetencies.length === 0) {\n      throw new InvalidCompetencyFrameworkAssignmentError(\n        "The current programme competency catalogue has no active competencies to snapshot",\n      );\n    }\n\n    let createdId: string;\n    try {\n      createdId = await prisma.$transaction(\n        async (tx) => {\n          const framework = await tx.programmeCompetencyFramework.upsert({\n            where: { programmeId_code: { programmeId, code: input.code } },\n            update: {},\n            create: { programmeId, code: input.code },\n            select: { id: true },\n          });\n          const latest = await tx.programmeCompetencyFrameworkVersion.aggregate({\n            where: { frameworkId: framework.id },\n            _max: { version: true },\n          });\n          const nextVersion = (latest._max.version ?? 0) + 1;\n          const created = await tx.programmeCompetencyFrameworkVersion.create({\n            data: {\n              frameworkId: framework.id,\n              version: nextVersion,\n              name: input.name,\n              changeNote: input.changeNote,\n              createdById: actorId,\n              competencies: {\n                create: sourceCompetencies.map((competency) => ({\n                  code: competency.code,\n                  name: competency.name,\n                  description: competency.description,\n                  order: competency.order,\n                  sourceActive: competency.active,\n                  ploCodes: competency.ploLinks.map((link) => link.plo.code).sort(),\n                })),\n              },\n            },\n            select: { id: true },\n          });\n          return created.id;\n        },\n        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },\n      );\n    } catch (error) {\n      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {\n        throw new CompetencyFrameworkConflictError(\n          "Competency framework version changed concurrently; retry the snapshot",\n        );\n      }\n      throw error;\n    }\n    return this.getById(createdId);\n  },\n\n  async getCurriculumVersionContext(versionId: string) {\n    const version = await prisma.programmeCurriculumVersion.findUnique({\n      where: { id: versionId },\n      select: {\n        id: true,\n        status: true,\n        curriculumId: true,\n        curriculum: { select: { programmeId: true } },\n      },\n    });\n    if (!version) throw new CompetencyFrameworkNotFoundError("Curriculum version not found");\n    return {\n      id: version.id,\n      status: version.status,\n      curriculumId: version.curriculumId,\n      programmeId: version.curriculum.programmeId,\n    };\n  },\n\n  async bindToCurriculumVersion(versionId: string, frameworkVersionId: string, actorId: string) {\n    const [context, framework] = await Promise.all([\n      this.getCurriculumVersionContext(versionId),\n      prisma.programmeCompetencyFrameworkVersion.findUnique({\n        where: { id: frameworkVersionId },\n        select: {\n          id: true,\n          version: true,\n          framework: { select: { programmeId: true, code: true } },\n        },\n      }),\n    ]);\n    if (!framework) throw new CompetencyFrameworkNotFoundError("Competency framework version not found");\n    if (context.status !== "Draft") {\n      throw new InvalidCompetencyFrameworkAssignmentError(\n        "Competency framework assignments can only change on Draft curriculum versions",\n      );\n    }\n    if (framework.framework.programmeId !== context.programmeId) {\n      throw new InvalidCompetencyFrameworkAssignmentError(\n        "Competency framework and curriculum version must belong to the same programme",\n      );\n    }\n\n    const current = await prisma.programmeCurriculumVersion.findUniqueOrThrow({\n      where: { id: versionId },\n      select: { competencyFrameworkVersionId: true },\n    });\n    if (current.competencyFrameworkVersionId === frameworkVersionId) return context;\n\n    await prisma.$transaction(async (tx) => {\n      await tx.programmeCurriculumVersion.update({\n        where: { id: versionId },\n        data: {\n          competencyFrameworkVersionId: frameworkVersionId,\n          competencyFrameworkAssignedById: actorId,\n          competencyFrameworkAssignedAt: new Date(),\n        },\n      });\n      await tx.programmeCurriculumAuditAction.create({\n        data: {\n          curriculumVersionId: versionId,\n          actorId,\n          action: "MetadataUpdated",\n          note: "Competency framework version assigned",\n          details: {\n            previousFrameworkVersionId: current.competencyFrameworkVersionId,\n            frameworkVersionId,\n            frameworkCode: framework.framework.code,\n            frameworkVersion: framework.version,\n          },\n        },\n      });\n    });\n    return context;\n  },\n\n  async getBindingForCurriculumVersion(versionId: string) {\n    const row = await prisma.programmeCurriculumVersion.findUnique({\n      where: { id: versionId },\n      select: {\n        competencyFrameworkAssignedById: true,\n        competencyFrameworkAssignedAt: true,\n        competencyFrameworkVersion: { include: frameworkVersionInclude },\n      },\n    });\n    if (!row?.competencyFrameworkVersion) return null;\n    if (!row.competencyFrameworkAssignedById || !row.competencyFrameworkAssignedAt) {\n      throw new InvalidCompetencyFrameworkAssignmentError(\n        "Curriculum competency framework provenance is incomplete",\n      );\n    }\n    return {\n      ...toFrameworkVersionView(row.competencyFrameworkVersion),\n      assignedById: row.competencyFrameworkAssignedById,\n      assignedAt: row.competencyFrameworkAssignedAt.toISOString(),\n    };\n  },\n};\n\nexport type CompetencyFrameworkService = typeof competencyFrameworkService;\n''',
)

# Curriculum service: include exact framework binding in reads and inherit it into revisions.
replace(
    "apps/backend/src/plugins/programme/curriculum-service.ts",
    'import { formatProgrammeCurriculumVersion } from "./curriculum-domain.ts";\n',
    'import { formatProgrammeCurriculumVersion } from "./curriculum-domain.ts";\nimport { competencyFrameworkService } from "./competency-framework-service.ts";\n',
)
replace(
    "apps/backend/src/plugins/programme/curriculum-service.ts",
    '              createdById: actorId,\n            },\n            select: { id: true },\n          });\n\n          if (predecessor.courses.length > 0) {',
    '              createdById: actorId,\n              competencyFrameworkVersionId: predecessor.competencyFrameworkVersionId,\n              competencyFrameworkAssignedById: predecessor.competencyFrameworkVersionId\n                ? actorId\n                : null,\n              competencyFrameworkAssignedAt: predecessor.competencyFrameworkVersionId\n                ? new Date()\n                : null,\n            },\n            select: { id: true },\n          });\n\n          if (predecessor.courses.length > 0) {',
)
replace(
    "apps/backend/src/plugins/programme/curriculum-service.ts",
    '    const visiblePlacementIds = await defaultRoutePlacementIds(selectedSummary.id);\n    const [placements, pathwayRows] = await Promise.all([\n',
    '    const visiblePlacementIds = await defaultRoutePlacementIds(selectedSummary.id);\n    const [placements, pathwayRows, competencyFramework] = await Promise.all([\n',
)
replace(
    "apps/backend/src/plugins/programme/curriculum-service.ts",
    '      prisma.programmeCurriculumPathway.findMany({\n        where: { curriculumVersionId: selectedSummary.id },',
    '      prisma.programmeCurriculumPathway.findMany({\n        where: { curriculumVersionId: selectedSummary.id },',
)
# Add the third Promise.all entry after pathway query closes.
replace(
    "apps/backend/src/plugins/programme/curriculum-service.ts",
    '        },\n      }),\n    ]);\n\n    const pathways = pathwayRows.map((pathway) => {',
    '        },\n      }),\n      competencyFrameworkService.getBindingForCurriculumVersion(selectedSummary.id),\n    ]);\n\n    const pathways = pathwayRows.map((pathway) => {',
)
replace(
    "apps/backend/src/plugins/programme/curriculum-service.ts",
    '      selectedVersion: toVersionSummary(selectedSummary),\n      versions: curriculum.versions.map(toVersionSummary),\n      years,',
    '      selectedVersion: toVersionSummary(selectedSummary),\n      versions: curriculum.versions.map(toVersionSummary),\n      competencyFramework,\n      years,',
)

# Router: programme-scoped read/create/bind routes.
replace(
    "apps/backend/src/plugins/programme/router.ts",
    '  CreateCurriculumRevisionSchema,\n  CreateInitialCurriculumSchema,\n',
    '  BindProgrammeCurriculumCompetencyFrameworkSchema,\n  CreateCurriculumRevisionSchema,\n  CreateInitialCurriculumSchema,\n  CreateProgrammeCompetencyFrameworkVersionSchema,\n',
)
replace(
    "apps/backend/src/plugins/programme/router.ts",
    'import { InvalidPloCodesError, programmeService } from "./service.ts";\n',
    '''import { InvalidPloCodesError, programmeService } from "./service.ts";\nimport {\n  CompetencyFrameworkConflictError,\n  CompetencyFrameworkNotFoundError,\n  InvalidCompetencyFrameworkAssignmentError,\n  competencyFrameworkService,\n} from "./competency-framework-service.ts";\n''',
)
route_block = r'''
  router.get(
    "/competency-frameworks/programmes/:programmeId",
    requirePermission("programme:read"),
    async (req, res) => {
      const programmeId = req.params.programmeId;
      if (!programmeId) {
        res.status(400).json({ error: "Programme id is required" });
        return;
      }
      if (!hasCurriculumScope(req.user, programmeId, CURRICULUM_READ_ROLES)) {
        res.status(403).json({ error: "No competency framework access for this programme" });
        return;
      }
      try {
        res.json(await competencyFrameworkService.listForProgramme(programmeId));
      } catch {
        res.status(500).json({ error: "Could not load competency framework versions" });
      }
    },
  );

  router.post(
    "/competency-frameworks/programmes/:programmeId",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = req.params.programmeId;
      if (!programmeId || !req.user) {
        res.status(400).json({ error: "Programme id is required" });
        return;
      }
      if (!hasCurriculumScope(req.user, programmeId, CURRICULUM_WRITE_ROLES)) {
        res.status(403).json({ error: "No competency framework write access for this programme" });
        return;
      }
      const parsed = CreateProgrammeCompetencyFrameworkVersionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid competency framework snapshot", details: parsed.error.flatten() });
        return;
      }
      try {
        res.status(201).json(
          await competencyFrameworkService.createSnapshot(programmeId, req.user.id, parsed.data),
        );
      } catch (error) {
        if (error instanceof CompetencyFrameworkNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof CompetencyFrameworkConflictError) {
          res.status(409).json({ error: error.message });
          return;
        }
        if (error instanceof InvalidCompetencyFrameworkAssignmentError) {
          res.status(400).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: "Could not create competency framework snapshot" });
      }
    },
  );

  router.put(
    "/curricula/versions/:versionId/competency-framework",
    requirePermission("programme:write"),
    async (req, res) => {
      const versionId = req.params.versionId;
      if (!versionId || !req.user) {
        res.status(400).json({ error: "Curriculum version id is required" });
        return;
      }
      const parsed = BindProgrammeCurriculumCompetencyFrameworkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid competency framework assignment", details: parsed.error.flatten() });
        return;
      }
      try {
        const context = await competencyFrameworkService.getCurriculumVersionContext(versionId);
        if (!hasCurriculumScope(req.user, context.programmeId, CURRICULUM_WRITE_ROLES)) {
          res.status(403).json({ error: "No curriculum write access for this programme" });
          return;
        }
        await competencyFrameworkService.bindToCurriculumVersion(
          versionId,
          parsed.data.frameworkVersionId,
          req.user.id,
        );
        res.json(await curriculumService.getById(context.curriculumId, versionId));
      } catch (error) {
        if (error instanceof CompetencyFrameworkNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof InvalidCompetencyFrameworkAssignmentError) {
          res.status(400).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: "Could not assign competency framework" });
      }
    },
  );

'''
replace(
    "apps/backend/src/plugins/programme/router.ts",
    '  router.get(\n    "/curricula/programmes/:programmeId",\n',
    route_block + '  router.get(\n    "/curricula/programmes/:programmeId",\n',
)

# Frontend API helpers.
replace(
    "apps/frontend/lib/curriculum.ts",
    '  BindCurriculumCourseSpecInput,\n  CreateInitialCurriculumInput,\n',
    '  BindCurriculumCourseSpecInput,\n  BindProgrammeCurriculumCompetencyFrameworkInput,\n  CreateInitialCurriculumInput,\n  CreateProgrammeCompetencyFrameworkVersionInput,\n',
)
replace(
    "apps/frontend/lib/curriculum.ts",
    '  ProgrammeCurriculumRead,\n  ReorderCurriculumCoursesInput,\n',
    '  ProgrammeCompetencyFrameworkVersion,\n  ProgrammeCurriculumRead,\n  ReorderCurriculumCoursesInput,\n',
)
replace(
    "apps/frontend/lib/curriculum.ts",
    '  get(curriculumId: string, versionId?: string): Promise<ProgrammeCurriculumRead> {\n    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";\n    return api.get<ProgrammeCurriculumRead>(`/api/programme/curricula/${encodeURIComponent(curriculumId)}${query}`);\n  },\n',
    '''  get(curriculumId: string, versionId?: string): Promise<ProgrammeCurriculumRead> {\n    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";\n    return api.get<ProgrammeCurriculumRead>(`/api/programme/curricula/${encodeURIComponent(curriculumId)}${query}`);\n  },\n  listCompetencyFrameworkVersions(): Promise<ProgrammeCompetencyFrameworkVersion[]> {\n    return api.get<ProgrammeCompetencyFrameworkVersion[]>(\n      `/api/programme/competency-frameworks/programmes/${CURRENT_PROGRAMME_ID}`,\n    );\n  },\n  createCompetencyFrameworkSnapshot(\n    input: CreateProgrammeCompetencyFrameworkVersionInput,\n  ): Promise<ProgrammeCompetencyFrameworkVersion> {\n    return api.post<ProgrammeCompetencyFrameworkVersion>(\n      `/api/programme/competency-frameworks/programmes/${CURRENT_PROGRAMME_ID}`,\n      input,\n    );\n  },\n  bindCompetencyFramework(\n    versionId: string,\n    input: BindProgrammeCurriculumCompetencyFrameworkInput,\n  ): Promise<ProgrammeCurriculumRead> {\n    return api.put<ProgrammeCurriculumRead>(\n      `/api/programme/curricula/versions/${encodeURIComponent(versionId)}/competency-framework`,\n      input,\n    );\n  },\n''',
)

# Frontend vertical-slice panel.
write(
    "apps/frontend/app/(shell)/curriculum/curriculum-competency-framework-panel.tsx",
    '''"use client";\n\nimport { useEffect, useMemo, useState } from "react";\nimport type { ProgrammeCompetencyFrameworkVersion, ProgrammeCurriculumRead } from "@dse-pms/shared-types";\nimport { ApiError } from "@/lib/api";\nimport { curriculumApi } from "@/lib/curriculum";\n\nexport function CurriculumCompetencyFrameworkPanel({\n  data,\n  canManage,\n  onUpdated,\n}: {\n  data: ProgrammeCurriculumRead;\n  canManage: boolean;\n  onUpdated: (data: ProgrammeCurriculumRead) => void;\n}) {\n  const binding = data.competencyFramework;\n  const [versions, setVersions] = useState<ProgrammeCompetencyFrameworkVersion[]>([]);\n  const [selectedId, setSelectedId] = useState(binding?.frameworkVersionId ?? "");\n  const [code, setCode] = useState(binding?.frameworkCode ?? "dse-graduate-competencies");\n  const [name, setName] = useState(binding?.name ?? "DSE Graduate Competencies");\n  const [changeNote, setChangeNote] = useState("");\n  const [busy, setBusy] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n\n  useEffect(() => {\n    setSelectedId(binding?.frameworkVersionId ?? "");\n    setCode(binding?.frameworkCode ?? "dse-graduate-competencies");\n    setName(binding?.name ?? "DSE Graduate Competencies");\n  }, [binding?.frameworkVersionId, binding?.frameworkCode, binding?.name]);\n\n  useEffect(() => {\n    if (!canManage) return;\n    let cancelled = false;\n    void curriculumApi\n      .listCompetencyFrameworkVersions()\n      .then((result) => {\n        if (!cancelled) setVersions(result);\n      })\n      .catch((err) => {\n        if (!cancelled) {\n          setError(err instanceof ApiError ? err.message : "Could not load competency framework versions");\n        }\n      });\n    return () => {\n      cancelled = true;\n    };\n  }, [canManage, data.selectedVersion.id]);\n\n  const selected = useMemo(\n    () => versions.find((version) => version.frameworkVersionId === selectedId) ?? null,\n    [selectedId, versions],\n  );\n\n  const bind = async (frameworkVersionId: string) => {\n    setBusy(true);\n    setError(null);\n    try {\n      onUpdated(\n        await curriculumApi.bindCompetencyFramework(data.selectedVersion.id, { frameworkVersionId }),\n      );\n    } catch (err) {\n      setError(err instanceof ApiError ? err.message : "Could not assign competency framework");\n    } finally {\n      setBusy(false);\n    }\n  };\n\n  const snapshotAndBind = async () => {\n    setBusy(true);\n    setError(null);\n    try {\n      const snapshot = await curriculumApi.createCompetencyFrameworkSnapshot({\n        code,\n        name,\n        changeNote,\n      });\n      setVersions((current) => [snapshot, ...current]);\n      setSelectedId(snapshot.frameworkVersionId);\n      onUpdated(\n        await curriculumApi.bindCompetencyFramework(data.selectedVersion.id, {\n          frameworkVersionId: snapshot.frameworkVersionId,\n        }),\n      );\n      setChangeNote("");\n    } catch (err) {\n      setError(err instanceof ApiError ? err.message : "Could not snapshot competency framework");\n    } finally {\n      setBusy(false);\n    }\n  };\n\n  return (\n    <section className="rounded-xl border bg-card p-5" aria-labelledby="competency-framework-title">\n      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">\n        <div>\n          <h3 id="competency-framework-title" className="font-semibold">\n            Competency framework\n          </h3>\n          <p className="mt-1 text-sm text-muted-foreground">\n            Versioned graduate-competency context pinned to this curriculum version.\n          </p>\n        </div>\n        <span className="text-xs font-medium text-muted-foreground">\n          {data.selectedVersion.status === "Draft" ? "Draft design context" : "Read-only historical snapshot"}\n        </span>\n      </div>\n\n      {binding ? (\n        <div className="mt-4 space-y-3">\n          <div className="rounded-lg border bg-background p-3">\n            <p className="font-medium">{binding.name}</p>\n            <p className="text-sm text-muted-foreground">\n              {binding.frameworkCode} · Framework v{binding.version} · {binding.competencies.length} competencies\n            </p>\n            {binding.changeNote && (\n              <p className="mt-2 text-sm text-muted-foreground">{binding.changeNote}</p>\n            )}\n          </div>\n          <div className="grid gap-2 md:grid-cols-2">\n            {binding.competencies.map((competency) => (\n              <article key={competency.id} className="rounded-lg border bg-background p-3">\n                <div className="flex items-start justify-between gap-3">\n                  <div>\n                    <p className="text-xs font-semibold text-muted-foreground">{competency.code}</p>\n                    <p className="font-medium">{competency.name}</p>\n                  </div>\n                  {competency.ploCodes.length > 0 && (\n                    <span className="text-xs text-muted-foreground">{competency.ploCodes.join(", ")}</span>\n                  )}\n                </div>\n                {competency.description && (\n                  <p className="mt-2 text-sm text-muted-foreground">{competency.description}</p>\n                )}\n              </article>\n            ))}\n          </div>\n        </div>\n      ) : (\n        <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">\n          No competency framework is linked to this curriculum version yet. Historical versions are never guessed or backfilled.\n        </p>\n      )}\n\n      {canManage && (\n        <div className="mt-5 grid gap-4 border-t pt-4 lg:grid-cols-2">\n          <div>\n            <p className="text-sm font-medium">Use an existing snapshot</p>\n            <div className="mt-2 flex gap-2">\n              <select\n                value={selectedId}\n                onChange={(event) => setSelectedId(event.target.value)}\n                className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"\n              >\n                <option value="">Select framework version…</option>\n                {versions.map((version) => (\n                  <option key={version.frameworkVersionId} value={version.frameworkVersionId}>\n                    {version.name} · v{version.version}\n                  </option>\n                ))}\n              </select>\n              <button\n                type="button"\n                disabled={busy || !selected}\n                onClick={() => selected && void bind(selected.frameworkVersionId)}\n                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"\n              >\n                Assign\n              </button>\n            </div>\n          </div>\n\n          <div>\n            <p className="text-sm font-medium">Snapshot current programme competencies</p>\n            <div className="mt-2 grid gap-2 sm:grid-cols-2">\n              <input\n                value={code}\n                onChange={(event) => setCode(event.target.value)}\n                aria-label="Framework code"\n                placeholder="Framework code"\n                className="h-10 rounded-md border bg-background px-3 text-sm"\n              />\n              <input\n                value={name}\n                onChange={(event) => setName(event.target.value)}\n                aria-label="Framework name"\n                placeholder="Framework name"\n                className="h-10 rounded-md border bg-background px-3 text-sm"\n              />\n              <input\n                value={changeNote}\n                onChange={(event) => setChangeNote(event.target.value)}\n                aria-label="Framework change note"\n                placeholder="Change note (optional)"\n                className="h-10 rounded-md border bg-background px-3 text-sm sm:col-span-2"\n              />\n            </div>\n            <button\n              type="button"\n              disabled={busy || !code.trim() || !name.trim()}\n              onClick={() => void snapshotAndBind()}\n              className="mt-2 h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50"\n            >\n              Create snapshot & assign\n            </button>\n          </div>\n          {error && <p className="text-sm text-destructive lg:col-span-2">{error}</p>}\n        </div>\n      )}\n    </section>\n  );\n}\n''',
)
replace(
    "apps/frontend/app/(shell)/curriculum/curriculum-page-client.tsx",
    'import { CurriculumPathwayView } from "./curriculum-pathway-view";\n',
    'import { CurriculumPathwayView } from "./curriculum-pathway-view";\nimport { CurriculumCompetencyFrameworkPanel } from "./curriculum-competency-framework-panel";\n',
)
replace(
    "apps/frontend/app/(shell)/curriculum/curriculum-page-client.tsx",
    '      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">\n        <Stat label="Total credits" value={data.totals.programmeCredits} />\n        <Stat label="Core" value={data.totals.coreCredits} />\n        <Stat label="Basic" value={data.totals.basicCredits} />\n        <Stat label="Elective" value={data.totals.electiveCredits} />\n        <Stat label="Specialization" value={data.totals.specializationCredits} />\n      </section>\n\n      <section className="rounded-xl border bg-card p-4">',
    '      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">\n        <Stat label="Total credits" value={data.totals.programmeCredits} />\n        <Stat label="Core" value={data.totals.coreCredits} />\n        <Stat label="Basic" value={data.totals.basicCredits} />\n        <Stat label="Elective" value={data.totals.electiveCredits} />\n        <Stat label="Specialization" value={data.totals.specializationCredits} />\n      </section>\n\n      <CurriculumCompetencyFrameworkPanel\n        data={data}\n        canManage={editable}\n        onUpdated={applyData}\n      />\n\n      <section className="rounded-xl border bg-card p-4">',
)

# Security inventory: all new public tables are backend-only/RLS protected.
replace(
    "apps/backend/scripts/verify-db-security.ts",
    '  "ProgrammeCurriculum",\n  "ProgrammeCurriculumVersion",\n',
    '  "ProgrammeCurriculum",\n  "ProgrammeCompetencyFramework",\n  "ProgrammeCompetencyFrameworkVersion",\n  "ProgrammeCompetencyFrameworkCompetency",\n  "ProgrammeCurriculumVersion",\n',
)

# DB migration: additive schema, RLS, cross-programme/Draft checks, immutable snapshots.
write(
    "apps/backend/prisma/migrations/20260903143000_add_curriculum_competency_framework_versions/migration.sql",
    '''-- Issue #812: version the existing programme competency/PLO design context and\n-- bind it to exact curriculum versions. Existing ProgramCompetency/PLO rows remain\n-- the current authoring catalogue; these tables are immutable historical snapshots.\n\nCREATE TABLE "ProgrammeCompetencyFramework" (\n  "id" TEXT NOT NULL,\n  "programmeId" TEXT NOT NULL,\n  "code" TEXT NOT NULL,\n  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  CONSTRAINT "ProgrammeCompetencyFramework_pkey" PRIMARY KEY ("id"),\n  CONSTRAINT "ProgrammeCompetencyFramework_programmeId_fkey"\n    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id")\n    ON DELETE RESTRICT ON UPDATE CASCADE\n);\n\nCREATE TABLE "ProgrammeCompetencyFrameworkVersion" (\n  "id" TEXT NOT NULL,\n  "frameworkId" TEXT NOT NULL,\n  "version" INTEGER NOT NULL,\n  "name" TEXT NOT NULL,\n  "changeNote" TEXT NOT NULL DEFAULT '',\n  "createdById" TEXT NOT NULL,\n  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  CONSTRAINT "ProgrammeCompetencyFrameworkVersion_pkey" PRIMARY KEY ("id"),\n  CONSTRAINT "ProgrammeCompetencyFrameworkVersion_version_check" CHECK ("version" >= 1),\n  CONSTRAINT "ProgrammeCompetencyFrameworkVersion_frameworkId_fkey"\n    FOREIGN KEY ("frameworkId") REFERENCES "ProgrammeCompetencyFramework"("id")\n    ON DELETE RESTRICT ON UPDATE CASCADE,\n  CONSTRAINT "ProgrammeCompetencyFrameworkVersion_createdById_fkey"\n    FOREIGN KEY ("createdById") REFERENCES "User"("id")\n    ON DELETE RESTRICT ON UPDATE CASCADE\n);\n\nCREATE TABLE "ProgrammeCompetencyFrameworkCompetency" (\n  "id" TEXT NOT NULL,\n  "frameworkVersionId" TEXT NOT NULL,\n  "code" TEXT NOT NULL,\n  "name" TEXT NOT NULL,\n  "description" TEXT,\n  "order" INTEGER NOT NULL,\n  "sourceActive" BOOLEAN NOT NULL DEFAULT TRUE,\n  "ploCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],\n  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  CONSTRAINT "ProgrammeCompetencyFrameworkCompetency_pkey" PRIMARY KEY ("id"),\n  CONSTRAINT "ProgrammeCompetencyFrameworkCompetency_order_check" CHECK ("order" >= 0),\n  CONSTRAINT "ProgrammeCompetencyFrameworkCompetency_frameworkVersionId_fkey"\n    FOREIGN KEY ("frameworkVersionId") REFERENCES "ProgrammeCompetencyFrameworkVersion"("id")\n    ON DELETE RESTRICT ON UPDATE CASCADE\n);\n\nCREATE UNIQUE INDEX "ProgrammeCompetencyFramework_programmeId_code_key"\n  ON "ProgrammeCompetencyFramework"("programmeId", "code");\nCREATE INDEX "ProgrammeCompetencyFramework_programmeId_idx"\n  ON "ProgrammeCompetencyFramework"("programmeId");\nCREATE UNIQUE INDEX "ProgrammeCompetencyFrameworkVersion_frameworkId_version_key"\n  ON "ProgrammeCompetencyFrameworkVersion"("frameworkId", "version");\nCREATE INDEX "ProgrammeCompetencyFrameworkVersion_frameworkId_idx"\n  ON "ProgrammeCompetencyFrameworkVersion"("frameworkId");\nCREATE INDEX "ProgrammeCompetencyFrameworkVersion_createdById_idx"\n  ON "ProgrammeCompetencyFrameworkVersion"("createdById");\nCREATE UNIQUE INDEX "ProgrammeCompetencyFrameworkCompetency_frameworkVersionId_code_key"\n  ON "ProgrammeCompetencyFrameworkCompetency"("frameworkVersionId", "code");\nCREATE UNIQUE INDEX "ProgrammeCompetencyFrameworkCompetency_frameworkVersionId_order_key"\n  ON "ProgrammeCompetencyFrameworkCompetency"("frameworkVersionId", "order");\nCREATE INDEX "ProgrammeCompetencyFrameworkCompetency_frameworkVersionId_idx"\n  ON "ProgrammeCompetencyFrameworkCompetency"("frameworkVersionId");\n\nALTER TABLE "ProgrammeCurriculumVersion"\n  ADD COLUMN "competencyFrameworkVersionId" TEXT,\n  ADD COLUMN "competencyFrameworkAssignedById" TEXT,\n  ADD COLUMN "competencyFrameworkAssignedAt" TIMESTAMP(3);\n\nALTER TABLE "ProgrammeCurriculumVersion"\n  ADD CONSTRAINT "ProgrammeCurriculumVersion_competencyFrameworkVersionId_fkey"\n  FOREIGN KEY ("competencyFrameworkVersionId") REFERENCES "ProgrammeCompetencyFrameworkVersion"("id")\n  ON DELETE RESTRICT ON UPDATE CASCADE;\nALTER TABLE "ProgrammeCurriculumVersion"\n  ADD CONSTRAINT "ProgrammeCurriculumVersion_competencyFrameworkAssignedById_fkey"\n  FOREIGN KEY ("competencyFrameworkAssignedById") REFERENCES "User"("id")\n  ON DELETE RESTRICT ON UPDATE CASCADE;\nCREATE INDEX "ProgrammeCurriculumVersion_competencyFrameworkVersionId_idx"\n  ON "ProgrammeCurriculumVersion"("competencyFrameworkVersionId");\nCREATE INDEX "ProgrammeCurriculumVersion_competencyFrameworkAssignedById_idx"\n  ON "ProgrammeCurriculumVersion"("competencyFrameworkAssignedById");\n\n-- Framework identities and snapshots are append-only. A correction creates a new\n-- framework version, preserving curriculum/SAR provenance.\nCREATE OR REPLACE FUNCTION "protect_programme_competency_framework_history"()\nRETURNS TRIGGER AS $$\nBEGIN\n  RAISE EXCEPTION 'Programme competency framework history is immutable; create a new framework version';\nEND;\n$$ LANGUAGE plpgsql;\n\nCREATE TRIGGER "ProgrammeCompetencyFramework_protect_history"\nBEFORE UPDATE OR DELETE ON "ProgrammeCompetencyFramework"\nFOR EACH ROW EXECUTE FUNCTION "protect_programme_competency_framework_history"();\nCREATE TRIGGER "ProgrammeCompetencyFrameworkVersion_protect_history"\nBEFORE UPDATE OR DELETE ON "ProgrammeCompetencyFrameworkVersion"\nFOR EACH ROW EXECUTE FUNCTION "protect_programme_competency_framework_history"();\nCREATE TRIGGER "ProgrammeCompetencyFrameworkCompetency_protect_history"\nBEFORE UPDATE OR DELETE ON "ProgrammeCompetencyFrameworkCompetency"\nFOR EACH ROW EXECUTE FUNCTION "protect_programme_competency_framework_history"();\n\n-- Association is editable only while the curriculum is Draft and the framework\n-- belongs to the same programme. This protects direct SQL as well as API writes.\nCREATE OR REPLACE FUNCTION "validate_curriculum_competency_framework_assignment"()\nRETURNS TRIGGER AS $$\nDECLARE\n  curriculum_programme_id TEXT;\n  framework_programme_id TEXT;\nBEGIN\n  IF NEW."competencyFrameworkVersionId" IS NULL THEN\n    IF NEW."competencyFrameworkAssignedById" IS NOT NULL\n       OR NEW."competencyFrameworkAssignedAt" IS NOT NULL THEN\n      RAISE EXCEPTION 'Competency framework provenance requires a framework version';\n    END IF;\n    RETURN NEW;\n  END IF;\n\n  IF NEW."status" <> 'Draft' THEN\n    IF TG_OP = 'INSERT'\n       OR NEW."competencyFrameworkVersionId" IS DISTINCT FROM OLD."competencyFrameworkVersionId"\n       OR NEW."competencyFrameworkAssignedById" IS DISTINCT FROM OLD."competencyFrameworkAssignedById"\n       OR NEW."competencyFrameworkAssignedAt" IS DISTINCT FROM OLD."competencyFrameworkAssignedAt" THEN\n      RAISE EXCEPTION 'Competency framework assignment can only change on Draft curriculum versions';\n    END IF;\n  END IF;\n\n  IF NEW."competencyFrameworkAssignedById" IS NULL OR NEW."competencyFrameworkAssignedAt" IS NULL THEN\n    RAISE EXCEPTION 'Competency framework assignment requires actor and timestamp provenance';\n  END IF;\n\n  SELECT c."programmeId"\n    INTO curriculum_programme_id\n    FROM "ProgrammeCurriculum" c\n    WHERE c."id" = NEW."curriculumId";\n\n  SELECT f."programmeId"\n    INTO framework_programme_id\n    FROM "ProgrammeCompetencyFrameworkVersion" fv\n    JOIN "ProgrammeCompetencyFramework" f ON f."id" = fv."frameworkId"\n    WHERE fv."id" = NEW."competencyFrameworkVersionId";\n\n  IF framework_programme_id IS NULL THEN\n    RAISE EXCEPTION 'Competency framework version does not exist';\n  END IF;\n  IF curriculum_programme_id IS DISTINCT FROM framework_programme_id THEN\n    RAISE EXCEPTION 'Competency framework and curriculum must belong to the same programme';\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nCREATE TRIGGER "ProgrammeCurriculumVersion_validate_competency_framework"\nBEFORE INSERT OR UPDATE OF "competencyFrameworkVersionId", "competencyFrameworkAssignedById", "competencyFrameworkAssignedAt"\nON "ProgrammeCurriculumVersion"\nFOR EACH ROW EXECUTE FUNCTION "validate_curriculum_competency_framework_assignment"();\n\n-- Keep new public tables on the backend-only access path.\nDO $$\nDECLARE\n  table_name text;\n  api_role text;\n  framework_tables constant text[] := ARRAY[\n    'ProgrammeCompetencyFramework',\n    'ProgrammeCompetencyFrameworkVersion',\n    'ProgrammeCompetencyFrameworkCompetency'\n  ];\nBEGIN\n  FOREACH table_name IN ARRAY framework_tables LOOP\n    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', table_name);\n    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', 'public', table_name);\n  END LOOP;\n  FOR api_role IN\n    SELECT rolname FROM pg_roles\n    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])\n  LOOP\n    FOREACH table_name IN ARRAY framework_tables LOOP\n      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', table_name, api_role);\n    END LOOP;\n  END LOOP;\nEND\n$$;\n''',
)

# DB regression tests.
write(
    "apps/backend/src/plugins/programme/competency-framework-service-db.test.ts",
    '''import { afterAll, describe, expect, test } from "bun:test";\nimport { PrismaClient } from "@prisma/client";\nimport { curriculumService } from "./curriculum-service.ts";\nimport {\n  InvalidCompetencyFrameworkAssignmentError,\n  competencyFrameworkService,\n} from "./competency-framework-service.ts";\n\nconst dbTestsEnabled = process.env.CURRICULUM_DB_TESTS === "1";\nconst describeDb = dbTestsEnabled ? describe : describe.skip;\nconst prisma = new PrismaClient();\nconst suffix = () => crypto.randomUUID().slice(0, 8);\n\nasync function createBase() {\n  const token = suffix();\n  const user = await prisma.user.create({\n    data: { email: `competency-framework-${token}@example.test`, name: `Competency Framework ${token}` },\n  });\n  const programme = await prisma.programme.create({\n    data: { id: `competency-framework-${token}`, code: `CF${token}`, name: `Competency Framework Programme ${token}` },\n  });\n  const curriculum = await curriculumService.createInitial(programme.id, user.id, {\n    code: `CURR-${token}`,\n    name: `Curriculum ${token}`,\n    cohortLabel: "",\n    intakeYear: null,\n    academicYear: "",\n    effectiveFrom: null,\n  });\n  return { user, programme, curriculum, token };\n}\n\ndescribeDb("curriculum competency framework versioning", () => {\n  test("snapshots canonical competencies, binds Draft only, and revision inherits the exact snapshot", async () => {\n    const { user, programme, curriculum, token } = await createBase();\n    const canonical = await prisma.programCompetency.findMany({\n      where: { active: true },\n      include: { ploLinks: { include: { plo: true } } },\n      orderBy: { order: "asc" },\n    });\n    expect(canonical.length).toBeGreaterThan(0);\n\n    const snapshot = await competencyFrameworkService.createSnapshot(programme.id, user.id, {\n      code: `framework-${token}`,\n      name: "Graduate Competencies",\n      changeNote: "Initial curriculum design baseline",\n    });\n    expect(snapshot.version).toBe(1);\n    expect(snapshot.competencies.map((item) => item.code)).toEqual(canonical.map((item) => item.code));\n    expect(snapshot.competencies[0]?.ploCodes).toEqual(\n      canonical[0]!.ploLinks.map((link) => link.plo.code).sort(),\n    );\n\n    await competencyFrameworkService.bindToCurriculumVersion(\n      curriculum.selectedVersion.id,\n      snapshot.frameworkVersionId,\n      user.id,\n    );\n    const bound = await curriculumService.getById(curriculum.curriculum.id, curriculum.selectedVersion.id);\n    expect(bound.competencyFramework).toMatchObject({\n      frameworkVersionId: snapshot.frameworkVersionId,\n      frameworkCode: `framework-${token}`,\n      version: 1,\n    });\n\n    await prisma.programmeCurriculumVersion.update({\n      where: { id: curriculum.selectedVersion.id },\n      data: { status: "Approved", approvedAt: new Date() },\n    });\n    await expect(\n      competencyFrameworkService.bindToCurriculumVersion(\n        curriculum.selectedVersion.id,\n        snapshot.frameworkVersionId,\n        user.id,\n      ),\n    ).rejects.toBeInstanceOf(InvalidCompetencyFrameworkAssignmentError);\n    await expect(\n      prisma.programmeCurriculumVersion.update({\n        where: { id: curriculum.selectedVersion.id },\n        data: { competencyFrameworkVersionId: null, competencyFrameworkAssignedById: null, competencyFrameworkAssignedAt: null },\n      }),\n    ).rejects.toThrow();\n\n    const revision = await curriculumService.createRevision(\n      curriculum.curriculum.id,\n      curriculum.selectedVersion.id,\n      user.id,\n      {\n        revisionType: "Minor",\n        revisionTriggers: ["ScheduledReview"],\n        revisionReason: "Periodic review",\n        changeSummary: "Start a new auditable design revision",\n      },\n    );\n    expect(revision.competencyFramework?.frameworkVersionId).toBe(snapshot.frameworkVersionId);\n    expect(revision.competencyFramework?.assignedById).toBe(user.id);\n  });\n\n  test("rejects cross-programme framework assignment and immutable snapshot mutation", async () => {\n    const first = await createBase();\n    const second = await createBase();\n    const snapshot = await competencyFrameworkService.createSnapshot(\n      second.programme.id,\n      second.user.id,\n      { code: `framework-${second.token}`, name: "Other programme framework", changeNote: "" },\n    );\n\n    await expect(\n      competencyFrameworkService.bindToCurriculumVersion(\n        first.curriculum.selectedVersion.id,\n        snapshot.frameworkVersionId,\n        first.user.id,\n      ),\n    ).rejects.toBeInstanceOf(InvalidCompetencyFrameworkAssignmentError);\n\n    await expect(\n      prisma.programmeCompetencyFrameworkVersion.update({\n        where: { id: snapshot.frameworkVersionId },\n        data: { changeNote: "rewrite history" },\n      }),\n    ).rejects.toThrow();\n  });\n});\n\nafterAll(async () => {\n  await prisma.$disconnect();\n});\n''',
)

# Shared contract tests do not require a database.
write(
    "packages/shared-types/src/curriculum-competency-framework.test.ts",
    '''import { describe, expect, test } from "bun:test";\nimport {\n  BindProgrammeCurriculumCompetencyFrameworkSchema,\n  CreateProgrammeCompetencyFrameworkVersionSchema,\n  ProgrammeCompetencyFrameworkVersionSchema,\n} from "./curriculum.ts";\n\ndescribe("curriculum competency framework contracts", () => {\n  test("accepts a strict framework snapshot request", () => {\n    expect(\n      CreateProgrammeCompetencyFrameworkVersionSchema.parse({\n        code: "dse-graduate-competencies",\n        name: "DSE Graduate Competencies",\n        changeNote: "2026 curriculum baseline",\n      }),\n    ).toEqual({\n      code: "dse-graduate-competencies",\n      name: "DSE Graduate Competencies",\n      changeNote: "2026 curriculum baseline",\n    });\n    expect(() =>\n      CreateProgrammeCompetencyFrameworkVersionSchema.parse({ code: "x", name: "X", extra: true }),\n    ).toThrow();\n  });\n\n  test("requires UUID framework versions for curriculum assignment", () => {\n    expect(BindProgrammeCurriculumCompetencyFrameworkSchema.safeParse({ frameworkVersionId: "nope" }).success).toBe(false);\n  });\n\n  test("preserves competency and PLO snapshot context", () => {\n    const id = "00000000-0000-4000-8000-000000000001";\n    const parsed = ProgrammeCompetencyFrameworkVersionSchema.parse({\n      frameworkId: id,\n      programmeId: "dse",\n      frameworkCode: "graduate",\n      frameworkVersionId: "00000000-0000-4000-8000-000000000002",\n      version: 1,\n      name: "Graduate Competencies",\n      changeNote: "baseline",\n      createdById: "00000000-0000-4000-8000-000000000003",\n      createdAt: "2026-09-03T00:00:00.000Z",\n      competencies: [\n        { id: "00000000-0000-4000-8000-000000000004", code: "C1", name: "Analysis", description: null, order: 1, sourceActive: true, ploCodes: ["PLO1"] },\n      ],\n    });\n    expect(parsed.competencies[0]?.ploCodes).toEqual(["PLO1"]);\n  });\n});\n''',
)

# Fresh DB CI explicitly exercises migration constraints and revision inheritance.
replace(
    ".github/workflows/ci.yml",
    '      - name: Verify curriculum revision and read service\n        run: bun test apps/backend/src/plugins/programme/curriculum-service-db.test.ts\n        env:\n          CURRICULUM_DB_TESTS: "1"\n\n',
    '      - name: Verify curriculum revision and read service\n        run: bun test apps/backend/src/plugins/programme/curriculum-service-db.test.ts\n        env:\n          CURRICULUM_DB_TESTS: "1"\n\n      - name: Verify curriculum competency framework history and binding integrity\n        run: bun test apps/backend/src/plugins/programme/competency-framework-service-db.test.ts\n        env:\n          CURRICULUM_DB_TESTS: "1"\n\n',
)

# Authorization integration: existing programme roles must guard read/create/bind boundaries.
replace(
    "apps/backend/src/integration/auth-authorization.integration.test.ts",
    '  test("missing, invalid, and expired bearer tokens return 401", async () => {\n',
    '''  test("curriculum competency framework routes enforce programme authorization", async () => {\n    const lecturerToken = signToken(context.users.lecturer);\n    const coordinatorToken = signToken(context.users.coordinator);\n\n    const deniedRead = await request("/api/programme/competency-frameworks/programmes/dse", {\n      token: lecturerToken,\n    });\n    expect(deniedRead.status).toBe(403);\n\n    const allowedRead = await request("/api/programme/competency-frameworks/programmes/dse", {\n      token: coordinatorToken,\n    });\n    expect(allowedRead.status).toBe(200);\n\n    const deniedCreate = await request("/api/programme/competency-frameworks/programmes/dse", {\n      method: "POST",\n      token: lecturerToken,\n      body: { code: "integration-framework", name: "Integration Framework", changeNote: "" },\n    });\n    expect(deniedCreate.status).toBe(403);\n\n    const created = await request("/api/programme/competency-frameworks/programmes/dse", {\n      method: "POST",\n      token: coordinatorToken,\n      body: { code: `integration-framework-${crypto.randomUUID().slice(0, 8)}`, name: "Integration Framework", changeNote: "Authorization smoke" },\n    });\n    expect(created.status).toBe(201);\n    const frameworkVersionId = (created.body as { frameworkVersionId?: string }).frameworkVersionId;\n    expect(frameworkVersionId).toBeTruthy();\n\n    const deniedBind = await request(\n      `/api/programme/curricula/versions/${context.curriculum.draftVersionId}/competency-framework`,\n      { method: "PUT", token: lecturerToken, body: { frameworkVersionId } },\n    );\n    expect(deniedBind.status).toBe(403);\n\n    const allowedBind = await request(\n      `/api/programme/curricula/versions/${context.curriculum.draftVersionId}/competency-framework`,\n      { method: "PUT", token: coordinatorToken, body: { frameworkVersionId } },\n    );\n    expect(allowedBind.status).toBe(200);\n    expect(\n      (allowedBind.body as { competencyFramework?: { frameworkVersionId?: string } }).competencyFramework?.frameworkVersionId,\n    ).toBe(frameworkVersionId);\n  });\n\n  test("missing, invalid, and expired bearer tokens return 401", async () => {\n''',
)

print("Issue #812 patch applied")
