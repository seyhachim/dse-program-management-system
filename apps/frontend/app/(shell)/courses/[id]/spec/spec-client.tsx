"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  SPEC_SECTIONS,
  type Method,
  type SpecSectionId,
  type SpecSectionStatus,
  type ProgrammeAcademicConfig,
  type Rubric,
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
import { ApiError, api } from "@/lib/api";
import { coursesApi, type CourseView } from "@/lib/courses";
import { courseSpecApi } from "@/lib/course-spec";
import { rubricsApi } from "@/lib/rubrics";
import { useMe } from "@/lib/auth";
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
import { TeachingLearningSection } from "./teaching-learning-section";
import {
  EMPTY_MAPPING,
  toMappingForm,
  toMappingPayload,
  validRefs,
  type MappingForm,
} from "./mapping-model";
import { OverviewTab } from "./overview-tab";
import { CompletionSummary } from "./completion-summary";
import { DocumentPreview } from "./document-preview";
import { buildCourseDocument } from "./course-document-model";
import { ReviewSubmitSection } from "./review-submit-section";
import { EMPTY_POLICY, PolicySection } from "./policy-section";
import type { PolicySection as PolicySectionValue } from "@dse-pms/shared-types";
/** Tab bar shown on the spec page — a curated view over `SPEC_SECTIONS`, not a 1:1 mirror of it. */
type TabId =
  | "overview"
  | "teachingLearning"
  | "documentPreview"
  | "reviewSubmit"
  | SpecSectionId;

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "clos", label: "CLOs" },
  { id: "teachingLearning", label: "Teaching & Learning" },
  { id: "assessmentPlan", label: "Assessment" },
  { id: "slt", label: "Weekly Plan" },
  { id: "mapping", label: "Constructive Alignment" },
  { id: "resources", label: "Resources" },
  { id: "policy", label: "Policies" },
  { id: "documentPreview", label: "Document Preview" },
  { id: "reviewSubmit", label: "Review & Submit" },
];

const EDITABLE_SPEC_TABS = new Set<TabId>([
  "clos",
  "teachingLearning",
  "assessmentPlan",
  "slt",
  "mapping",
  "resources",
  "policy",
]);

const REVIEW_EDITABLE_STATUSES = new Set(["draft", "changesRequested"]);

const sectionMeta = (id: TabId) => SPEC_SECTIONS.find((s) => s.id === id);

export function SpecClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const { me } = useMe();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTabState] = useState<TabId>(() => {
    const requested = searchParams.get("tab");
    return TABS.some((t) => t.id === requested)
      ? (requested as TabId)
      : "overview";
  });
  const [course, setCourse] = useState<CourseView | null>(null);
  const [status, setStatus] = useState<Record<string, SpecSectionStatus>>({});
  const [review, setReview] = useState<NonNullable<
    Awaited<ReturnType<typeof courseSpecApi.get>>["review"]
  > | null>(null);
  const [courseInfo, setCourseInfo] =
    useState<CourseInfoForm>(EMPTY_COURSE_INFO);
  const [clos, setClos] = useState<CloForm[]>(EMPTY_CLOS);
  const [weeklyPlan, setWeeklyPlan] =
    useState<WeeklyPlanForm>(EMPTY_WEEKLY_PLAN);
  const [assessments, setAssessments] =
    useState<AssessmentForm[]>(EMPTY_ASSESSMENTS);
  const [mapping, setMapping] = useState<MappingForm>(EMPTY_MAPPING);
  const [policy, setPolicy] = useState<PolicySectionValue>(EMPTY_POLICY);
  const [closSavedAt, setClosSavedAt] = useState<Date | null>(null);
  const [courseTotalSlt, setCourseTotalSlt] = useState<number | null>(null);
  const [teachingMethods, setTeachingMethods] = useState<Method[]>([]);
  const [programme, setProgramme] = useState<ProgrammeAcademicConfig | null>(
    null,
  );
  const [assessmentMethods, setAssessmentMethods] = useState<Method[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [courseInfoDialogOpen, setCourseInfoDialogOpen] = useState(false);

  // Review & Submit readiness:
  // CLOs are complete only when there is at least one active CLO and
  // every active CLO has at least one PLO mapping.
  const activeClos = useMemo(
    () => clos.filter((clo) => clo.status === "active"),
    [clos],
  );

  const cloReady = useMemo(
    () =>
      activeClos.length > 0 &&
      activeClos.every(
        (clo) => clo.description.trim().length > 0 && clo.mappedPlos.length > 0,
      ),
    [activeClos],
  );

  // Teaching & Learning is complete when every active CLO has
  // at least one teaching method assigned.
  const teachingLearningReady = useMemo(
    () =>
      activeClos.length > 0 &&
      activeClos.every((clo) => clo.teachingMethodIds.length > 0),
    [activeClos],
  );
  const setActiveTab = useCallback(
    (id: TabId) => {
      const locked =
        review !== null && !REVIEW_EDITABLE_STATUSES.has(review.status);
      const nextId = locked && EDITABLE_SPEC_TABS.has(id) ? "reviewSubmit" : id;
      setActiveTabState(nextId);
      router.replace(
        nextId === "overview" ? pathname : `${pathname}?tab=${nextId}`,
        {
          scroll: false,
        },
      );
    },
    [pathname, review, router],
  );

  const editingLocked =
    review !== null && !REVIEW_EDITABLE_STATUSES.has(review.status);

  useEffect(() => {
    if (editingLocked && EDITABLE_SPEC_TABS.has(activeTab)) {
      setActiveTab("reviewSubmit");
    }
  }, [activeTab, editingLocked, setActiveTab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [spec, methods, courseView, programmeConfig, rubricList] = await Promise.all([
        courseSpecApi.get(courseId),
        methodsApi.list(),
        coursesApi.get(courseId),
        api.get<ProgrammeAcademicConfig>("/api/programme"),
        rubricsApi.list().catch(() => [] as Rubric[]),
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
      setPolicy(
        (spec.data.policy as PolicySectionValue | undefined) ?? EMPTY_POLICY,
      );
      setStatus(spec.status ?? {});
      setReview(spec.review);
      setTeachingMethods(methods.teaching);
      setAssessmentMethods(methods.assessment);
      setRubrics(rubricList);
      setCourse(courseView);
      setCourseTotalSlt(courseView.totalSltHours ?? null);
      setProgramme(programmeConfig);
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
      if (editingLocked) {
        setError(
          "This course specification is locked while it is in the review workflow.",
        );
        return false;
      }
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
    [courseId, editingLocked],
  );

  // §17 saves per action (add / edit / duplicate / delete), like §14, so it persists
  // an explicit list rather than reading possibly-stale `assessments` state.
  const persistAssessments = useCallback(
    async (items: AssessmentForm[]) => {
      if (editingLocked) {
        setError(
          "This course specification is locked while it is in the review workflow.",
        );
        return false;
      }
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
    [courseId, editingLocked],
  );

  const persistWeeklyPlan = useCallback(
    async (items: WeeklyPlanForm) => {
      if (editingLocked) {
        setError(
          "This course specification is locked while it is in the review workflow.",
        );
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        await courseSpecApi.saveSection(
          courseId,
          "slt",
          toWeeklyPlanPayload(items),
        );
        setWeeklyPlan(items);
        setStatus((s) => ({ ...s, slt: "complete" }));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to save weekly plan",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId, editingLocked],
  );

  const persistPolicy = useCallback(
    async (value: PolicySectionValue) => {
      if (editingLocked) {
        setError(
          "This course specification is locked while it is in the review workflow.",
        );
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        await courseSpecApi.saveSection(courseId, "policy", value);
        setPolicy(value);
        setStatus((s) => ({ ...s, policy: "complete" }));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to save course policies",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId, editingLocked],
  );

  const submitForReview = useCallback(
    async (note: string) => {
      setSaving(true);
      setError(null);
      try {
        const next = await courseSpecApi.submit(courseId, note);
        setStatus(next.status ?? {});
        setReview(next.review);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to submit course specification",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId],
  );

  const saveSection = useCallback(
    async (sectionId: "courseInfo" | "mapping") => {
      if (editingLocked) {
        setError(
          "This course specification is locked while it is in the review workflow.",
        );
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        if (sectionId === "courseInfo") {
          await courseSpecApi.saveSection(
            courseId,
            "courseInfo",
            toCourseInfoPayload(courseInfo),
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
    [
      courseId,
      courseInfo,
      clos,
      weeklyPlan,
      assessments,
      mapping,
      editingLocked,
    ],
  );

  const canReview = me?.permissions.includes("courses:review") ?? false;

  const handleRequestChanges = useCallback(
    async (note: string) => {
      setSaving(true);
      setError(null);
      try {
        const next = await courseSpecApi.requestChanges(courseId, note);
        setStatus(next.status ?? {});
        setReview(next.review);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to request changes",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId],
  );

  const handleApprove = useCallback(
    async (note: string) => {
      setSaving(true);
      setError(null);
      try {
        const next = await courseSpecApi.approve(courseId, note);
        setStatus(next.status ?? {});
        setReview(next.review);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to approve course specification",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId],
  );

  const canSaveActive = activeTab === "mapping";

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

  const courseDocument = useMemo(
    () =>
      buildCourseDocument({
        courseInfo,
        courseId,
        clos,
        weeklyPlan,
        assessments,
        rubrics,
        mapping,
        teachingMethods,
        assessmentMethods,
        programme,
      }),
    [
      courseInfo,
      courseId,
      clos,
      weeklyPlan,
      assessments,
      rubrics,
      mapping,
      teachingMethods,
      assessmentMethods,
      programme,
    ],
  );

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
        <>
          {editingLocked ? (
            <div className="rounded-lg border border-blue-200/70 bg-blue-50/60 px-3 py-2.5 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
              <span className="font-semibold">
                {review?.status === "approved"
                  ? "Course specification approved."
                  : "Course specification locked."}
              </span>{" "}
              {review?.status === "approved"
                ? "This approved version is read-only."
                : "Editing is unavailable while the course specification is in the review workflow."}
            </div>
          ) : null}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabId)}
          >
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
                onEditCourseInfo={() => {
                  if (!editingLocked) setCourseInfoDialogOpen(true);
                  else
                    setError(
                      "This course specification is locked while it is in the review workflow.",
                    );
                }}
                onGoToTab={(id) => setActiveTab(id)}
                readOnly={editingLocked}
              />
            </TabsContent>

            <TabsContent value="clos" className="mt-4">
              <ClosSection
                value={clos}
                courseId={courseId}
                lastSavedAt={closSavedAt}
                programme={programme}
                onPersist={persistClos}
              />
            </TabsContent>

            <TabsContent value="teachingLearning" className="mt-4">
              <TeachingLearningSection
                value={clos}
                teachingMethods={teachingMethods}
                onPersist={persistClos}
              />
            </TabsContent>

            <TabsContent value="slt" className="mt-4">
              {/* <WeeklyPlanSectionForm
              value={weeklyPlan}
              onPersist={persistWeeklyPlan}
              courseName={
                course ? `${course.code} - ${course.title}` : undefined
              }
              clos={clos}
            /> */}
              <WeeklyPlanSectionForm
                value={weeklyPlan}
                onPersist={persistWeeklyPlan}
                courseId={courseId}
                courseName={
                  course ? `${course.code} - ${course.title}` : undefined
                }
                clos={clos}
                teachingMethods={teachingMethods}
                assessmentMethods={assessmentMethods}
              />
            </TabsContent>

            <TabsContent value="assessmentPlan" className="mt-4">
              <AssessmentSection
                value={assessments}
                clos={clos}
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
              <PolicySection
                value={policy}
                programPolicy={programme?.policy ?? null}
                onPersist={persistPolicy}
                disabled={editingLocked}
              />
            </TabsContent>

            <TabsContent value="documentPreview" className="mt-4">
              {course ? (
                // <DocumentPreview
                //   course={course}
                //   courseInfo={courseInfo}
                //   clos={clos}
                //   weeklyPlan={weeklyPlan}
                //   assessments={assessments}
                // />
                <DocumentPreview document={courseDocument} />
              ) : (
                <SectionPanel>
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Course information is not available.
                  </div>
                </SectionPanel>
              )}
            </TabsContent>

            <TabsContent value="reviewSubmit" className="mt-4">
              {course && review ? (
                <ReviewSubmitSection
                  course={course}
                  status={status}
                  review={review}
                  cloReady={cloReady}
                  teachingLearningReady={teachingLearningReady}
                  onSubmit={submitForReview}
                  onPreview={() => setActiveTab("documentPreview")}
                  onGoToSection={goToSection}
                  saving={saving}
                  canReview={canReview}
                  onRequestChanges={handleRequestChanges}
                  onApprove={handleApprove}
                />
              ) : null}
            </TabsContent>

            {canSaveActive ? (
              <div className="mt-4 flex items-center justify-end gap-3">
                {savedFlash ? (
                  <span className="text-sm text-emerald-600">Saved ✓</span>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => saveSection("mapping")}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            ) : null}
          </Tabs>
        </>
      )}

      <Dialog
        open={courseInfoDialogOpen && !editingLocked}
        onOpenChange={(open) => {
          if (!editingLocked) setCourseInfoDialogOpen(open);
        }}
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
