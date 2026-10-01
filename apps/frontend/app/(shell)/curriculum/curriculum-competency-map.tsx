"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CurriculumCompetencyLevel,
  CurriculumCompetencyMap,
  CurriculumCompetencyMapCourse,
  CurriculumCourseCompetencyMapping,
  ProgrammeCompetencyFrameworkCompetency,
  ProgrammeCurriculumRead,
} from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { curriculumApi } from "@/lib/curriculum";
import {
  DEFAULT_COMPETENCY_MAP_FILTERS,
  buildCompetencyPathway,
  compactMappingLabel,
  filterCompetencyMapCourses,
  findCompetencyMapping,
  levelShort,
  visibleCompetencies,
  type CompetencyMapFilters,
} from "./curriculum-competency-map-model";

type MapTab = "teaching" | "tua" | "pathway";
type EditorSelection = {
  course: CurriculumCompetencyMapCourse;
  competency: ProgrammeCompetencyFrameworkCompetency;
} | null;

const LEVELS: CurriculumCompetencyLevel[] = [
  "Basic",
  "Intermediate",
  "Advanced",
];

const COURSE_TYPES = [
  "Basic",
  "Core",
  "Elective",
  "Specialization",
  "MoeysHeip",
] as const;

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MappingTokens({
  mapping,
  teachingOnly = false,
}: {
  mapping: CurriculumCourseCompetencyMapping | null;
  teachingOnly?: boolean;
}) {
  if (teachingOnly) {
    return mapping?.teachLevel ? (
      <span className="inline-flex min-w-7 justify-center rounded border px-1.5 py-0.5 font-semibold">
        {levelShort(mapping.teachLevel)}
      </span>
    ) : (
      <span aria-hidden="true" className="text-muted-foreground/60">
        —
      </span>
    );
  }

  if (!mapping) {
    return (
      <span aria-hidden="true" className="text-muted-foreground/60">
        —
      </span>
    );
  }

  const tokens = [
    mapping.teachLevel ? ["T", mapping.teachLevel] as const : null,
    mapping.useLevel ? ["U", mapping.useLevel] as const : null,
    mapping.assessLevel ? ["A", mapping.assessLevel] as const : null,
  ].filter(
    (token): token is readonly ["T" | "U" | "A", CurriculumCompetencyLevel] =>
      Boolean(token),
  );

  return (
    <span className="flex flex-wrap justify-center gap-1">
      {tokens.map(([action, level]) => (
        <span
          key={action}
          className="inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium"
        >
          {action}:{levelShort(level)}
        </span>
      ))}
    </span>
  );
}

function CellButton({
  course,
  competency,
  mapping,
  teachingOnly,
  canEdit,
  onOpen,
}: {
  course: CurriculumCompetencyMapCourse;
  competency: ProgrammeCompetencyFrameworkCompetency;
  mapping: CurriculumCourseCompetencyMapping | null;
  teachingOnly: boolean;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const canOpen = Boolean(mapping || canEdit);
  const label = teachingOnly
    ? mapping?.teachLevel
      ? `Teach ${mapping.teachLevel}`
      : "No teaching mapping recorded"
    : compactMappingLabel(mapping);

  if (!canOpen) {
    return (
      <div
        className="min-h-9 min-w-12 px-1 py-1 text-center"
        aria-label={`${course.code}, ${competency.code} ${competency.name}: ${label}`}
      >
        <MappingTokens mapping={mapping} teachingOnly={teachingOnly} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${competency.code} — ${competency.name}: ${label}`}
      aria-label={`${course.code}, ${competency.code} ${competency.name}: ${label}. ${canEdit ? "Edit mapping" : "View mapping"}`}
      className="min-h-9 min-w-12 rounded-md px-1 py-1 text-center outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <MappingTokens mapping={mapping} teachingOnly={teachingOnly} />
    </button>
  );
}

function MappingEditor({
  selection,
  map,
  canEdit,
  onClose,
  onUpdated,
}: {
  selection: EditorSelection;
  map: CurriculumCompetencyMap;
  canEdit: boolean;
  onClose: () => void;
  onUpdated: (map: CurriculumCompetencyMap) => void;
}) {
  const mapping = selection
    ? findCompetencyMapping(selection.course, selection.competency.id)
    : null;
  const [teachLevel, setTeachLevel] = useState<
    CurriculumCompetencyLevel | null
  >(null);
  const [useLevel, setUseLevel] = useState<CurriculumCompetencyLevel | null>(
    null,
  );
  const [assessLevel, setAssessLevel] = useState<
    CurriculumCompetencyLevel | null
  >(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTeachLevel(mapping?.teachLevel ?? null);
    setUseLevel(mapping?.useLevel ?? null);
    setAssessLevel(mapping?.assessLevel ?? null);
    setNote(mapping?.note ?? "");
    setError(null);
  }, [mapping?.id, mapping?.teachLevel, mapping?.useLevel, mapping?.assessLevel, mapping?.note]);

  if (!selection) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(
        await curriculumApi.updateCompetencyMapping(
          map.curriculumVersion.id,
          selection.course.placementId,
          selection.competency.id,
          { teachLevel, useLevel, assessLevel, note },
        ),
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save course competency mapping",
      );
    } finally {
      setBusy(false);
    }
  };

  const row = (
    label: string,
    value: CurriculumCompetencyLevel | null,
    setter: (value: CurriculumCompetencyLevel | null) => void,
  ) => (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {canEdit ? (
        <select
          value={value ?? ""}
          onChange={(event) =>
            setter(
              event.target.value
                ? (event.target.value as CurriculumCompetencyLevel)
                : null,
            )
          }
          className="h-10 rounded-md border bg-background px-3"
        >
          <option value="">None</option>
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      ) : (
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          {value ?? "No mapping recorded"}
        </div>
      )}
    </label>
  );

  const clearing = !teachLevel && !useLevel && !assessLevel;

  return (
    <Dialog open={Boolean(selection)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!top-0 !right-0 !left-auto !h-dvh !max-w-lg !translate-x-0 !translate-y-0 overflow-y-auto !rounded-none sm:!max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {selection.course.code} × {selection.competency.code}
          </DialogTitle>
          <DialogDescription>
            {selection.course.title} · {selection.competency.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            Teach, Use, and Assess are independent. Each recorded action keeps
            its Basic, Intermediate, or Advanced level.
          </div>

          {row("Teach", teachLevel, setTeachLevel)}
          {row("Use", useLevel, setUseLevel)}
          {row("Assess", assessLevel, setAssessLevel)}

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Mapping note</span>
            {canEdit ? (
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Optional rationale or review note"
                className="rounded-md border bg-background px-3 py-2"
              />
            ) : (
              <div className="min-h-12 rounded-md border bg-muted/20 px-3 py-2">
                {mapping?.note || "No note recorded"}
              </div>
            )}
          </label>

          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Read-only historical mapping. Changes require a Draft curriculum
              revision.
            </p>
          )}
          {mapping && (
            <p className="text-xs text-muted-foreground">
              Last updated {new Date(mapping.updatedAt).toLocaleString()}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : clearing ? "Clear mapping" : "Save mapping"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseIdentity({ course }: { course: CurriculumCompetencyMapCourse }) {
  return (
    <div className="min-w-52">
      <p className="font-semibold">{course.code}</p>
      <p className="max-w-64 truncate text-xs text-muted-foreground">
        {course.title}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Y{course.yearLevel} · S{course.semester === "First" ? 1 : 2} ·{" "}
        {course.courseType}
      </p>
    </div>
  );
}

function Matrix({
  courses,
  competencies,
  mode,
  expanded,
  canEdit,
  onSelect,
  onCompetencyPathway,
}: {
  courses: CurriculumCompetencyMapCourse[];
  competencies: ProgrammeCompetencyFrameworkCompetency[];
  mode: "teaching" | "tua";
  expanded: boolean;
  canEdit: boolean;
  onSelect: (selection: NonNullable<EditorSelection>) => void;
  onCompetencyPathway: (competencyId: string) => void;
}) {
  if (courses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No courses match the current filters.
      </div>
    );
  }

  const expandedTua = mode === "tua" && expanded;

  return (
    <>
      <div className="hidden overflow-auto rounded-lg border md:block">
        <table className="min-w-max border-collapse text-xs">
          <thead className="sticky top-0 z-30 bg-card">
            <tr>
              <th
                rowSpan={expandedTua ? 2 : 1}
                className="sticky left-0 z-40 min-w-60 border-b border-r bg-card px-3 py-2 text-left"
              >
                Course
              </th>
              {competencies.map((competency) => (
                <th
                  key={competency.id}
                  colSpan={expandedTua ? 3 : 1}
                  className="border-b border-r bg-card px-2 py-2 text-center"
                >
                  <button
                    type="button"
                    onClick={() => onCompetencyPathway(competency.id)}
                    className="rounded px-1 py-0.5 font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                    title={competency.name}
                    aria-label={`${competency.code} — ${competency.name}. Open competency pathway.`}
                  >
                    {competency.code}
                  </button>
                </th>
              ))}
            </tr>
            {expandedTua && (
              <tr>
                {competencies.flatMap((competency) =>
                  (["T", "U", "A"] as const).map((action) => (
                    <th
                      key={`${competency.id}-${action}`}
                      className="min-w-12 border-b border-r bg-card px-2 py-1 text-center font-medium text-muted-foreground"
                    >
                      {action}
                    </th>
                  )),
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {courses.map((course) => (
              <tr key={course.placementId} className="border-b last:border-b-0">
                <td className="sticky left-0 z-20 border-r bg-card px-3 py-2 align-top">
                  <CourseIdentity course={course} />
                </td>
                {competencies.flatMap((competency) => {
                  const mapping = findCompetencyMapping(course, competency.id);
                  if (expandedTua) {
                    const values = [
                      ["Teach", mapping?.teachLevel ?? null],
                      ["Use", mapping?.useLevel ?? null],
                      ["Assess", mapping?.assessLevel ?? null],
                    ] as const;
                    return values.map(([action, value]) => (
                      <td
                        key={`${competency.id}-${action}`}
                        className="border-r px-1 py-1 text-center align-middle"
                      >
                        <button
                          type="button"
                          disabled={!canEdit && !mapping}
                          onClick={() => onSelect({ course, competency })}
                          className="min-h-8 min-w-9 rounded px-1 font-semibold outline-none enabled:hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default"
                          aria-label={`${course.code}, ${competency.code}, ${action}: ${value ?? "No mapping recorded"}`}
                        >
                          {levelShort(value)}
                        </button>
                      </td>
                    ));
                  }

                  return [
                    <td
                      key={competency.id}
                      className="border-r px-1 py-1 text-center align-middle"
                    >
                      <CellButton
                        course={course}
                        competency={competency}
                        mapping={mapping}
                        teachingOnly={mode === "teaching"}
                        canEdit={canEdit}
                        onOpen={() => onSelect({ course, competency })}
                      />
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {courses.map((course) => {
          const relevant = competencies
            .map((competency) => ({
              competency,
              mapping: findCompetencyMapping(course, competency.id),
            }))
            .filter(({ mapping }) =>
              mode === "teaching" ? Boolean(mapping?.teachLevel) : Boolean(mapping),
            );

          return (
            <article
              key={course.placementId}
              className="rounded-lg border bg-background p-3"
            >
              <CourseIdentity course={course} />
              <div className="mt-3 space-y-2">
                {relevant.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No mapping recorded for the current view.
                  </p>
                ) : (
                  relevant.map(({ competency, mapping }) => (
                    <button
                      key={competency.id}
                      type="button"
                      onClick={() => onSelect({ course, competency })}
                      className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <span>
                        <span className="font-semibold">{competency.code}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {competency.name}
                        </span>
                      </span>
                      <MappingTokens
                        mapping={mapping}
                        teachingOnly={mode === "teaching"}
                      />
                    </button>
                  ))
                )}
              </div>
              {canEdit && (
                <div className="mt-3">
                  <label className="text-xs text-muted-foreground">
                    Add or review competency
                    <select
                      defaultValue=""
                      onChange={(event) => {
                        const competency = competencies.find(
                          (item) => item.id === event.target.value,
                        );
                        if (competency) onSelect({ course, competency });
                        event.currentTarget.value = "";
                      }}
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                    >
                      <option value="">Select competency…</option>
                      {competencies.map((competency) => (
                        <option key={competency.id} value={competency.id}>
                          {competency.code} — {competency.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

function Filters({
  map,
  filters,
  onChange,
}: {
  map: CurriculumCompetencyMap;
  filters: CompetencyMapFilters;
  onChange: (filters: CompetencyMapFilters) => void;
}) {
  const set = <K extends keyof CompetencyMapFilters,>(
    key: K,
    value: CompetencyMapFilters[K],
  ) => onChange({ ...filters, [key]: value });

  return (
    <div className="grid gap-2 rounded-lg border bg-muted/10 p-3 sm:grid-cols-2 xl:grid-cols-6">
      <label className="text-xs">
        Year
        <select
          value={filters.year}
          onChange={(event) =>
            set(
              "year",
              event.target.value === "all"
                ? "all"
                : (Number(event.target.value) as 1 | 2 | 3 | 4),
            )
          }
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        >
          <option value="all">All years</option>
          {[1, 2, 3, 4].map((year) => (
            <option key={year} value={year}>
              Year {year}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs">
        Semester
        <select
          value={filters.semester}
          onChange={(event) =>
            set(
              "semester",
              event.target.value as "all" | "First" | "Second",
            )
          }
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        >
          <option value="all">All semesters</option>
          <option value="First">Semester 1</option>
          <option value="Second">Semester 2</option>
        </select>
      </label>

      <label className="text-xs">
        Pathway
        <select
          value={filters.pathwayId}
          onChange={(event) => set("pathwayId", event.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        >
          <option value="all">All pathways</option>
          <option value="unassigned">Common / no pathway</option>
          {map.pathways.map((pathway) => (
            <option key={pathway.id} value={pathway.id}>
              {pathway.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs">
        Course type
        <select
          value={filters.courseType}
          onChange={(event) =>
            set(
              "courseType",
              event.target.value as CompetencyMapFilters["courseType"],
            )
          }
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        >
          <option value="all">All types</option>
          {COURSE_TYPES.map((courseType) => (
            <option key={courseType} value={courseType}>
              {courseType}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs">
        Competency
        <select
          value={filters.competencyId}
          onChange={(event) => set("competencyId", event.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        >
          <option value="all">All competencies</option>
          {(map.framework?.competencies ?? []).map((competency) => (
            <option key={competency.id} value={competency.id}>
              {competency.code} — {competency.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs">
        Search course
        <Input
          value={filters.search}
          onChange={(event) => set("search", event.target.value)}
          placeholder="Code or title"
          className="mt-1 h-9"
        />
      </label>
    </div>
  );
}

export function CurriculumCompetencyMapPanel({
  data,
  canManage,
}: {
  data: ProgrammeCurriculumRead;
  canManage: boolean;
}) {
  const [map, setMap] = useState<CurriculumCompetencyMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<MapTab>("teaching");
  const [expanded, setExpanded] = useState(false);
  const [filters, setFilters] = useState<CompetencyMapFilters>(
    DEFAULT_COMPETENCY_MAP_FILTERS,
  );
  const [selection, setSelection] = useState<EditorSelection>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void curriculumApi
      .competencyMap(data.selectedVersion.id)
      .then((result) => {
        if (!cancelled) setMap(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load course competency mapping",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    data.selectedVersion.id,
    data.competencyFramework?.frameworkVersionId,
  ]);

  const canEdit =
    canManage && data.selectedVersion.status === "Draft";

  const filteredCourses = useMemo(
    () => (map ? filterCompetencyMapCourses(map.courses, filters) : []),
    [map, filters],
  );
  const competencies = useMemo(
    () => (map ? visibleCompetencies(map, filters.competencyId) : []),
    [map, filters.competencyId],
  );

  const pathwayCompetency = useMemo(() => {
    if (!map?.framework?.competencies.length) return null;
    if (filters.competencyId !== "all") {
      return (
        map.framework.competencies.find(
          (competency) => competency.id === filters.competencyId,
        ) ?? null
      );
    }
    return map.framework.competencies[0] ?? null;
  }, [map, filters.competencyId]);

  const pathway = useMemo(
    () =>
      map && pathwayCompetency
        ? buildCompetencyPathway(
            map,
            pathwayCompetency.id,
            filteredCourses,
          )
        : [],
    [map, pathwayCompetency, filteredCourses],
  );

  const openPathway = (competencyId: string) => {
    setFilters((current) => ({ ...current, competencyId }));
    setTab("pathway");
  };

  if (loading) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <div className="h-56 animate-pulse rounded-lg bg-muted/40" />
      </section>
    );
  }

  if (error || !map) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Course–Competency Mapping</h3>
        <p className="mt-2 text-sm text-destructive">
          {error ?? "Could not load mapping"}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="competency-map-title">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 id="competency-map-title" className="font-semibold">
            Course–Competency Mapping
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Teach / Use / Assess at Basic / Intermediate / Advanced levels for
            curriculum v{map.curriculumVersion.version}.
          </p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {canEdit ? "Draft · editable" : "Read-only historical map"}
        </span>
      </div>

      {!map.framework ? (
        <div className="mt-4 rounded-lg border border-dashed p-6 text-center">
          <p className="font-medium">No competency framework assigned</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign a versioned competency framework above before recording
            course mappings.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Competencies"
              value={map.summary.competencyCount}
            />
            <SummaryCard label="Courses" value={map.summary.courseCount} />
            <SummaryCard
              label="Mapped courses"
              value={map.summary.mappedCourseCount}
            />
            <SummaryCard
              label="Needs mapping review"
              value={map.summary.unmappedCourseCount}
              hint={`${map.summary.unmappedCompetencyCount} competencies have no recorded mapping`}
            />
          </div>

          <Filters map={map} filters={filters} onChange={setFilters} />

          <Tabs value={tab} onValueChange={(value) => setTab(value as MapTab)}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <TabsList className="w-full overflow-x-auto sm:w-auto">
                <TabsTrigger value="teaching">Teaching Map</TabsTrigger>
                <TabsTrigger value="tua">Teach / Use / Assess</TabsTrigger>
                <TabsTrigger value="pathway">Competency Pathway</TabsTrigger>
              </TabsList>

              {tab === "tua" && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">View</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={!expanded ? "secondary" : "outline"}
                    onClick={() => setExpanded(false)}
                  >
                    Compact
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={expanded ? "secondary" : "outline"}
                    onClick={() => setExpanded(true)}
                  >
                    Expanded
                  </Button>
                </div>
              )}
            </div>

            <TabsContent value="teaching" className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Shows where each competency is explicitly taught. B = Basic, I
                = Intermediate, A = Advanced. Empty means no mapping recorded.
              </p>
              <Matrix
                courses={filteredCourses}
                competencies={competencies}
                mode="teaching"
                expanded={false}
                canEdit={canEdit}
                onSelect={setSelection}
                onCompetencyPathway={openPathway}
              />
            </TabsContent>

            <TabsContent value="tua" className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                T = Teach, U = Use, A = Assess. Each action keeps its own B / I
                / A level.
              </p>
              <Matrix
                courses={filteredCourses}
                competencies={competencies}
                mode="tua"
                expanded={expanded}
                canEdit={canEdit}
                onSelect={setSelection}
                onCompetencyPathway={openPathway}
              />
            </TabsContent>

            <TabsContent value="pathway" className="mt-3">
              {pathwayCompetency ? (
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/10 p-3">
                    <p className="font-semibold">
                      {pathwayCompetency.code} — {pathwayCompetency.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Progression is derived from the same canonical course ×
                      competency mapping rows.
                    </p>
                  </div>

                  {pathway.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                      No mapping recorded for this competency under the current
                      filters.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {pathway.map((year) => (
                        <div key={year.yearLevel}>
                          <h4 className="mb-2 text-sm font-semibold">
                            Year {year.yearLevel}
                          </h4>
                          <div className="grid gap-3 lg:grid-cols-2">
                            {year.semesters.map((semester) => (
                              <div
                                key={semester.semester}
                                className="rounded-lg border bg-background p-3"
                              >
                                <p className="text-xs font-semibold text-muted-foreground">
                                  Semester {semester.semester === "First" ? 1 : 2}
                                </p>
                                <div className="mt-2 space-y-2">
                                  {semester.courses.map(
                                    ({ course, mapping, pathwayName }) => (
                                      <button
                                        key={course.placementId}
                                        type="button"
                                        onClick={() =>
                                          setSelection({
                                            course,
                                            competency: pathwayCompetency,
                                          })
                                        }
                                        className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                                      >
                                        <span>
                                          <span className="font-semibold">
                                            {course.code}
                                          </span>
                                          <span className="ml-2 text-xs text-muted-foreground">
                                            {course.title}
                                          </span>
                                          {pathwayName && (
                                            <span className="mt-1 block text-[11px] text-muted-foreground">
                                              {pathwayName}
                                            </span>
                                          )}
                                        </span>
                                        <MappingTokens mapping={mapping} />
                                      </button>
                                    ),
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No competency is available in the bound framework.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      <MappingEditor
        selection={selection}
        map={map}
        canEdit={canEdit}
        onClose={() => setSelection(null)}
        onUpdated={setMap}
      />
    </section>
  );
}
