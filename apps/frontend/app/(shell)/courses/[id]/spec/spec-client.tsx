"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  SPEC_SECTIONS,
  type Method,
  type SpecSectionId,
  type SpecSectionStatus,
} from "@dse-pms/shared-types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { coursesApi, type CourseView } from "@/lib/courses";
import { courseSpecApi } from "@/lib/course-spec";
import { methodsApi } from "@/lib/methods";
import {
  CourseInfoSection,
  EMPTY_COURSE_INFO,
  toCourseInfoForm,
  toCourseInfoPayload,
  type CourseInfoForm,
} from "./course-info-section";
import {
  ClosSection,
  EMPTY_CLOS,
  toClosForm,
  toClosPayload,
  type CloForm,
} from "./clos-section";
import {
  WeeklyPlanSectionForm,
  EMPTY_WEEKLY_PLAN,
  toWeeklyPlanForm,
  toWeeklyPlanPayload,
  type WeeklyPlanForm,
} from "./weekly-plan-section";
import {
  AssessmentSection,
  EMPTY_ASSESSMENTS,
  toAssessmentForm,
  toAssessmentPayload,
  type AssessmentForm,
} from "./assessment-section";
import { MappingSection } from "./mapping-section";
import {
  EMPTY_MAPPING,
  toMappingForm,
  toMappingPayload,
  validRefs,
  type MappingForm,
} from "./mapping-model";
import { OverviewTab } from "./overview-tab";
import { CompletionSummary } from "./completion-summary";

/** Tab bar shown on the spec page — a curated view over `SPEC_SECTIONS`, not a 1:1 mirror of it. */
type TabId = "overview" | "documentPreview" | SpecSectionId;

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "clos", label: "CLOs" },
  { id: "slt", label: "Weekly Plan" },
  { id: "assessmentPlan", label: "Assessment" },
  { id: "resources", label: "Resources" },
  { id: "policy", label: "Policies" },
  { id: "mapping", label: "Mapping" },
  { id: "documentPreview", label: "Document Preview" },
];

const sectionMeta = (id: TabId) => SPEC_SECTIONS.find((s) => s.id === id);

export function SpecClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTabState] = useState<TabId>(() => {
    const requested = searchParams.get("tab");
    return TABS.some((t) => t.id === requested)
      ? (requested as TabId)
      : "overview";
  });
  const setActiveTab = useCallback(
    (id: TabId) => {
      setActiveTabState(id);
      router.replace(id === "overview" ? pathname : `${pathname}?tab=${id}`, {
        scroll: false,
      });
    },
    [pathname, router],
  );
  const [course, setCourse] = useState<CourseView | null>(null);
  const [status, setStatus] = useState<Record<string, SpecSectionStatus>>({});
  const [courseInfo, setCourseInfo] =
    useState<CourseInfoForm>(EMPTY_COURSE_INFO);
  const [clos, setClos] = useState<CloForm[]>(EMPTY_CLOS);
  const [weeklyPlan, setWeeklyPlan] =
    useState<WeeklyPlanForm>(EMPTY_WEEKLY_PLAN);
  const [assessments, setAssessments] =
    useState<AssessmentForm[]>(EMPTY_ASSESSMENTS);
  const [mapping, setMapping] = useState<MappingForm>(EMPTY_MAPPING);
  const [closSavedAt, setClosSavedAt] = useState<Date | null>(null);
  const [courseTotalSlt, setCourseTotalSlt] = useState<number | null>(null);
  const [teachingMethods, setTeachingMethods] = useState<Method[]>([]);
  const [assessmentMethods, setAssessmentMethods] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [courseInfoDialogOpen, setCourseInfoDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [spec, methods, courseView] = await Promise.all([
        courseSpecApi.get(courseId),
        methodsApi.list(),
        coursesApi.get(courseId),
      ]);
      setCourseInfo(
        toCourseInfoForm(
          spec.data.courseInfo as Record<string, unknown> | undefined,
        ),
      );
      setClos(toClosForm(spec.data.clos, spec.data.cloMapping));
      setWeeklyPlan(toWeeklyPlanForm(spec.data.slt));
      setAssessments(toAssessmentForm(spec.data.assessmentPlan));
      setMapping(toMappingForm(spec.data.mapping));
      setStatus(spec.status ?? {});
      setTeachingMethods(methods.teaching);
      setAssessmentMethods(methods.assessment);
      setCourse(courseView);
      setCourseTotalSlt(courseView.totalSltHours ?? null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load the course specification",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  // §14 saves per action (add / edit / duplicate / delete), so it persists an
  // explicit list rather than reading possibly-stale `clos` state from a closure.
  const persistClos = useCallback(
    async (items: CloForm[]) => {
      setClos(items);
      setSaving(true);
      setError(null);
      try {
        await courseSpecApi.saveSection(courseId, "clos", toClosPayload(items));
        setStatus((s) => ({ ...s, clos: "complete" }));
        setClosSavedAt(new Date());
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to save this section",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId],
  );

  // §17 saves per action (add / edit / duplicate / delete), like §14, so it persists
  // an explicit list rather than reading possibly-stale `assessments` state.
  const persistAssessments = useCallback(
    async (items: AssessmentForm[]) => {
      setAssessments(items);
      setSaving(true);
      setError(null);
      try {
        await courseSpecApi.saveSection(
          courseId,
          "assessmentPlan",
          toAssessmentPayload(items),
        );
        setStatus((s) => ({ ...s, assessmentPlan: "complete" }));
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to save this section",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId],
  );

  const saveSection = useCallback(
    async (sectionId: "courseInfo" | "slt" | "mapping") => {
      setSaving(true);
      setError(null);
      try {
        if (sectionId === "courseInfo") {
          await courseSpecApi.saveSection(
            courseId,
            "courseInfo",
            toCourseInfoPayload(courseInfo),
          );
        } else if (sectionId === "slt") {
          await courseSpecApi.saveSection(
            courseId,
            "slt",
            toWeeklyPlanPayload(weeklyPlan),
          );
        } else if (sectionId === "mapping") {
          const refs = validRefs(clos, weeklyPlan, assessments);
          const payload = toMappingPayload(mapping, refs);
          setMapping(payload.cells);
          await courseSpecApi.saveSection(courseId, "mapping", payload);
        }
        setStatus((s) => ({ ...s, [sectionId]: "complete" }));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to save this section",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId, courseInfo, clos, weeklyPlan, assessments, mapping],
  );

  const canSaveActive = activeTab === "slt" || activeTab === "mapping";

  // Course Information (courseInfo) has no tab of its own — it's edited via the
  // dialog opened from the Overview tab — so "Continue Editing" needs a special
  // case to land there and open it, rather than just switching tabs like the rest.
  const goToSection = useCallback(
    (sectionId: SpecSectionId) => {
      if (sectionId === "courseInfo") {
        setActiveTab("overview");
        setCourseInfoDialogOpen(true);
      } else {
        setActiveTab(sectionId);
      }
    },
    [setActiveTab],
  );

  const breadcrumbLabel = course
    ? `${course.code} – ${course.title}`
    : "Course Specification";
  const activeTabLabel = TABS.find((t) => t.id === activeTab)?.label;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link href="/courses">Course Management</Link>}
            />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Course Specification</BreadcrumbPage>
          </BreadcrumbItem>
          {activeTab !== "overview" && activeTabLabel ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{activeTabLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>

      <header>
        <h1 className="text-2xl font-bold text-foreground">
          Course Specification
        </h1>
        <p className="text-sm text-muted-foreground">
          Design and manage your course in OBE format.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
          {error}
        </div>
      ) : null}

      {loading ? null : (
        <CompletionSummary status={status} onContinue={goToSection} />
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
          <TabsList variant="line" className="w-full justify-start ">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab
              courseInfo={courseInfo}
              clos={clos}
              weeklyPlan={weeklyPlan}
              assessments={assessments}
              status={status}
              courseTotalSlt={courseTotalSlt}
              onEditCourseInfo={() => setCourseInfoDialogOpen(true)}
              onGoToTab={(id) => setActiveTab(id)}
            />
          </TabsContent>

          <TabsContent value="clos" className="mt-4">
            <ClosSection
              value={clos}
              courseId={courseId}
              teachingMethods={teachingMethods}
              assessmentMethods={assessmentMethods}
              courseTotalSlt={courseTotalSlt}
              lastSavedAt={closSavedAt}
              onPersist={persistClos}
            />
          </TabsContent>

          <TabsContent value="slt" className="mt-4">
            <WeeklyPlanSectionForm
              value={weeklyPlan}
              onChange={setWeeklyPlan}
              courseId={courseId}
              courseName={
                course ? `${course.code} - ${course.title}` : undefined
              }
              cloCodes={clos.map((c) => c.code)}
            />
          </TabsContent>

          <TabsContent value="assessmentPlan" className="mt-4">
            <AssessmentSection
              value={assessments}
              courseId={courseId}
              onPersist={persistAssessments}
            />
          </TabsContent>

          <TabsContent value="mapping" className="mt-4">
            <MappingSection
              clos={clos}
              weeklyPlan={weeklyPlan}
              assessments={assessments}
              value={mapping}
              onChange={setMapping}
              courseName={
                course ? `${course.code} - ${course.title}` : undefined
              }
            />
          </TabsContent>

          <TabsContent value="resources" className="mt-4">
            <SectionPanel>
              <ComingSoon meta={sectionMeta("resources")} />
            </SectionPanel>
          </TabsContent>

          <TabsContent value="policy" className="mt-4">
            <SectionPanel>
              <ComingSoon meta={sectionMeta("policy")} />
            </SectionPanel>
          </TabsContent>

          <TabsContent value="documentPreview" className="mt-4">
            <SectionPanel>
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  Document Preview
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Assembling Part 1 + Part 2 into the final syllabus document is
                  coming in a later phase. Each section above is saved as you
                  go, so nothing here is lost once this ships.
                </p>
              </div>
            </SectionPanel>
          </TabsContent>

          {canSaveActive ? (
            <div className="mt-4 flex items-center justify-end gap-3">
              {savedFlash ? (
                <span className="text-sm text-emerald-600">Saved ✓</span>
              ) : null}
              <Button
                variant="outline"
                onClick={() => saveSection(activeTab as "slt" | "mapping")}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : null}
        </Tabs>
      )}

      <Dialog
        open={courseInfoDialogOpen}
        onOpenChange={setCourseInfoDialogOpen}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Course Information</DialogTitle>
          </DialogHeader>
          <CourseInfoSection
            value={courseInfo}
            onChange={(patch) => setCourseInfo((v) => ({ ...v, ...patch }))}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCourseInfoDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const ok = await saveSection("courseInfo");
                if (ok) setCourseInfoDialogOpen(false);
              }}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      {children}
    </section>
  );
}

function ComingSoon({ meta }: { meta?: { title: string; ref?: string } }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium text-foreground">
        {meta?.title}{" "}
        <span className="text-muted-foreground">({meta?.ref})</span>
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        This section is coming in a later phase. The full syllabus structure is
        shown here so you can see the whole document — for now, fill in{" "}
        <strong>Course Information</strong>, CLOs, Weekly Plan, and Mapping.
      </p>
    </div>
  );
}
