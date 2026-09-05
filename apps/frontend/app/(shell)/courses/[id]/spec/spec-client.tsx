"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  type SpecSectionId,
  type SpecSectionStatus,
  teachingLearningIsReady,
  type DateSection as DateSectionValue,
  type PolicySection as PolicySectionValue,
  type StudentResponsibilitySection as StudentResponsibilityValue,
} from "@dse-pms/shared-types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import type { CourseSpecAuthoringData } from "@/lib/course-spec-authoring-data";
import { courseSpecApi } from "@/lib/course-spec";
import { useMe } from "@/lib/auth";
import {
  CourseInfoSection,
  toCourseInfoForm,
  toCourseInfoPayload,
  type CourseInfoForm,
} from "./course-info-section";
import {
  ClosSection,
  toClosForm,
  toClosPayload,
  type CloForm,
} from "./clos-section";
import {
  WeeklyPlanSectionForm,
  toWeeklyPlanForm,
  toWeeklyPlanPayload,
  type WeeklyPlanForm,
} from "./weekly-plan-section";
import {
  AssessmentSection,
  toAssessmentForm,
  toAssessmentPayload,
  type AssessmentForm,
} from "./assessment-section";
import { MappingSection } from "./mapping-section";
import { TeachingLearningSection } from "./teaching-learning-section";
import {
  toMappingForm,
  toMappingPayload,
  validRefs,
  type MappingForm,
} from "./mapping-model";
import { OverviewTab } from "./overview-tab";
import { DocumentPreview } from "./document-preview";
import { buildCourseDocument } from "./course-document-model";
import { ReviewSubmitSection } from "./review-submit-section";
import { EMPTY_POLICY } from "./policy-section";
import { EMPTY_DATE } from "./date-section";
import { LearningResourcesSection } from "./learning-resources-section";
import {
  toResourcesForm,
  toResourcesPayload,
  type ResourcesForm,
} from "./resources-model";
import {
  toReferencesForm,
  toReferencesPayload,
  type ReferencesForm,
} from "./references-model";
import { EMPTY_STUDENT_RESPONSIBILITY } from "./student-responsibility-section";
import { PoliciesResponsibilitiesSection } from "./policies-responsibilities-section";
import { normalizePoliciesResponsibilitiesTab } from "./policies-responsibilities-model";
import { CourseSpecNotice } from "./authoring-section-ui";

/** Tab bar shown on the spec page — a curated view over `SPEC_SECTIONS`, not a 1:1 mirror of it. */
type TabId =
  | "overview"
  | "teachingLearning"
  | "documentPreview"
  | "reviewSubmit"
  | SpecSectionId;

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "courseInfo", label: "Course Information" },
  { id: "clos", label: "CLOs" },
  { id: "teachingLearning", label: "Teaching & Learning" },
  { id: "assessmentPlan", label: "Assessment" },
  { id: "slt", label: "Weekly Plan" },
  { id: "mapping", label: "Constructive Alignment" },
  { id: "resources", label: "Resources" },
  { id: "policy", label: "Policies & Responsibilities" },
  { id: "documentPreview", label: "Document Preview" },
  { id: "reviewSubmit", label: "Review & Submit" },
];

const EDITABLE_SPEC_TABS = new Set<TabId>([
  "courseInfo",
  "clos",
  "teachingLearning",
  "assessmentPlan",
  "slt",
  "mapping",
  "resources",
  "references",
  "policy",
]);

const REVIEW_EDITABLE_STATUSES = new Set(["draft", "changesRequested"]);

export function SpecClient({
  courseId,
  initialData,
}: {
  courseId: string;
  initialData: CourseSpecAuthoringData;
}) {
  const { me } = useMe();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialSpec = initialData.spec;
  const course = initialData.course;
  const teachingMethods = initialData.methods.teaching;
  const assessmentMethods = initialData.methods.assessment;
  const rubrics = initialData.rubrics;
  const programme = initialData.programme;
  const courseTotalSlt = course.totalSltHours ?? null;

  const [activeTab, setActiveTabState] = useState<TabId>(() => {
    const requested = normalizePoliciesResponsibilitiesTab(
      searchParams.get("tab"),
    );
    if (requested === "references") return "resources";
    return TABS.some((t) => t.id === requested)
      ? (requested as TabId)
      : "overview";
  });
  const [status, setStatus] = useState<Record<string, SpecSectionStatus>>(
    initialSpec.status ?? {},
  );
  const [review, setReview] = useState<NonNullable<
    Awaited<ReturnType<typeof courseSpecApi.get>>["review"]
  > | null>(initialSpec.review);
  const [courseInfo, setCourseInfo] = useState<CourseInfoForm>(() =>
    toCourseInfoForm(
      initialSpec.data.courseInfo as Record<string, unknown> | undefined,
    ),
  );
  const [clos, setClos] = useState<CloForm[]>(() =>
    toClosForm(initialSpec.data.clos, initialSpec.data.cloMapping),
  );
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanForm>(() =>
    toWeeklyPlanForm(initialSpec.data.slt),
  );
  const [assessments, setAssessments] = useState<AssessmentForm[]>(() =>
    toAssessmentForm(initialSpec.data.assessmentPlan),
  );
  const [mapping, setMapping] = useState<MappingForm>(() =>
    toMappingForm(initialSpec.data.mapping),
  );
  const [policy, setPolicy] = useState<PolicySectionValue>(
    (initialSpec.data.policy as PolicySectionValue | undefined) ?? EMPTY_POLICY,
  );
  const [specDate, setSpecDate] = useState<DateSectionValue>(
    (initialSpec.data.date as DateSectionValue | undefined) ?? EMPTY_DATE,
  );
  const [resources, setResources] = useState<ResourcesForm>(() =>
    toResourcesForm(initialSpec.data.resources),
  );
  const [references, setReferences] = useState<ReferencesForm>(() =>
    toReferencesForm(initialSpec.data.references),
  );
  const [responsibility, setResponsibility] =
    useState<StudentResponsibilityValue>(
      (initialSpec.data.responsibility as
        | StudentResponsibilityValue
        | undefined) ?? EMPTY_STUDENT_RESPONSIBILITY,
    );
  const [closSavedAt, setClosSavedAt] = useState<Date | null>(null);
  const [courseInfoSavedFlash, setCourseInfoSavedFlash] = useState(false);
  const [teachingLearningProfile, setTeachingLearningProfile] = useState(
    initialData.teachingLearningProfile,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

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

  const teachingLearningReady = useMemo(
    () => teachingLearningIsReady(teachingLearningProfile, clos),
    [teachingLearningProfile, clos],
  );

  const setActiveTab = useCallback(
    (id: TabId) => {
      const policyNormalizedId = normalizePoliciesResponsibilitiesTab(id) as TabId;
      const normalizedId: TabId =
        policyNormalizedId === "references" ? "resources" : policyNormalizedId;
      const locked =
        review !== null && !REVIEW_EDITABLE_STATUSES.has(review.status);
      const nextId =
        locked && EDITABLE_SPEC_TABS.has(normalizedId)
          ? "reviewSubmit"
          : normalizedId;
      setActiveTabState(nextId);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (nextId === "overview") url.searchParams.delete("tab");
        else url.searchParams.set("tab", nextId);
        window.history.replaceState(
          window.history.state,
          "",
          `${pathname}${url.search}${url.hash}`,
        );
      }
    },
    [pathname, review],
  );

  const editingLocked =
    review !== null && !REVIEW_EDITABLE_STATUSES.has(review.status);

  useEffect(() => {
    if (editingLocked && EDITABLE_SPEC_TABS.has(activeTab)) {
      setActiveTab("reviewSubmit");
    }
  }, [activeTab, editingLocked, setActiveTab]);

  const persistClos = useCallback(
    async (items: CloForm[]) => {
      if (editingLocked) {
        setError("This course specification is locked while it is in the review workflow.");
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
        setError(err instanceof ApiError ? err.message : "Failed to save this section");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId, editingLocked],
  );

  const persistAssessments = useCallback(
    async (items: AssessmentForm[]) => {
      if (editingLocked) {
        setError("This course specification is locked while it is in the review workflow.");
        return false;
      }
      setAssessments(items);
      setSaving(true);
      setError(null);
      try {
        await courseSpecApi.saveSection(courseId, "assessmentPlan", toAssessmentPayload(items));
        setStatus((s) => ({ ...s, assessmentPlan: "complete" }));
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save this section");
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
        setError("This course specification is locked while it is in the review workflow.");
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        await courseSpecApi.saveSection(courseId, "slt", toWeeklyPlanPayload(items));
        setWeeklyPlan(items);
        setStatus((s) => ({ ...s, slt: "complete" }));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save weekly plan");
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
        setError("This course specification is locked while it is in the review workflow.");
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
        setError(err instanceof ApiError ? err.message : "Failed to save course policies");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId, editingLocked],
  );

  const persistDate = useCallback(
    async (value: DateSectionValue) => {
      if (editingLocked) {
        setError("This course specification is locked while it is in the review workflow.");
        return false;
      }
      setSaving(true);
      setError(null);
      const normalized = value.date?.trim() || null;
      try {
        await courseSpecApi.saveSection(courseId, "date", { date: normalized });
        setSpecDate({ date: normalized });
        setStatus((s) => ({
          ...s,
          date: normalized ? "complete" : "draft",
        }));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to save the Specification Date",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId, editingLocked],
  );

  const persistResources = useCallback(
    async (items: ResourcesForm) => {
      if (editingLocked) {
        setError("This course specification is locked while it is in the review workflow.");
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        await courseSpecApi.saveSection(
          courseId,
          "resources",
          toResourcesPayload(items, weeklyPlan),
        );
        setResources(items);
        setStatus((s) => ({ ...s, resources: "complete" }));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save resources");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId, editingLocked, weeklyPlan],
  );

  const persistReferences = useCallback(
    async (items: ReferencesForm) => {
      if (editingLocked) {
        setError("This course specification is locked while it is in the review workflow.");
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        await courseSpecApi.saveSection(
          courseId,
          "references",
          toReferencesPayload(items),
        );
        setReferences(items);
        setStatus((s) => ({ ...s, references: "complete" }));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save references");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId, editingLocked],
  );

  const persistResponsibility = useCallback(
    async (value: StudentResponsibilityValue) => {
      if (editingLocked) {
        setError("This course specification is locked while it is in the review workflow.");
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        await courseSpecApi.saveSection(courseId, "responsibility", value);
        setResponsibility(value);
        setStatus((s) => ({ ...s, responsibility: "complete" }));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save student responsibility");
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
        setError(err instanceof ApiError ? err.message : "Failed to submit course specification");
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
        setError("This course specification is locked while it is in the review workflow.");
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        if (sectionId === "courseInfo") {
          await courseSpecApi.saveSection(courseId, "courseInfo", toCourseInfoPayload(courseInfo));
        } else if (sectionId === "mapping") {
          const refs = validRefs(clos, weeklyPlan, assessments);
          const payload = toMappingPayload(mapping, refs);
          setMapping(payload.cells);
          await courseSpecApi.saveSection(courseId, "mapping", payload);
        }
        setStatus((s) => ({ ...s, [sectionId]: "complete" }));
        if (sectionId === "courseInfo") {
          setCourseInfoSavedFlash(true);
          setTimeout(() => setCourseInfoSavedFlash(false), 2000);
        } else {
          setSavedFlash(true);
          setTimeout(() => setSavedFlash(false), 2000);
        }
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save this section");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId, courseInfo, clos, weeklyPlan, assessments, mapping, editingLocked],
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
        setError(err instanceof ApiError ? err.message : "Failed to request changes");
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
        setError(err instanceof ApiError ? err.message : "Failed to approve course specification");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [courseId],
  );

  const canSaveActive = activeTab === "mapping";

  const goToSection = useCallback(
    (sectionId: SpecSectionId) => {
      if (sectionId === "references") {
        setActiveTab("resources");
      } else {
        setActiveTab(sectionId);
      }
    },
    [setActiveTab],
  );

  const breadcrumbLabel = `${course.code} – ${course.title}`;
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
        teachingLearningProfile,
        resources,
        references,
        responsibility,
        policy,
        specDate,
        courseTotalSlt,
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
      teachingLearningProfile,
      resources,
      references,
      responsibility,
      policy,
      specDate,
      courseTotalSlt,
    ],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/courses">Course Management</Link>} />
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
        <h1 className="text-2xl font-bold text-foreground">Course Specification</h1>
        <p className="text-sm text-muted-foreground">Design and manage your course in OBE format.</p>
      </header>

      {error ? (
        <CourseSpecNotice tone="error">{error}</CourseSpecNotice>
      ) : null}

      {editingLocked ? (
        <CourseSpecNotice>
          <span className="font-semibold">
            {review?.status === "approved"
              ? "Course specification approved."
              : "Course specification locked."}
          </span>{" "}
          {review?.status === "approved"
            ? "This approved version is read-only."
            : "Editing is unavailable while the course specification is in the review workflow."}
        </CourseSpecNotice>
      ) : null}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <div className="rounded-xl border border-border bg-card p-1.5 shadow-sm">
          <TabsList
            variant="line"
            className="flex w-full justify-start gap-1 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-semibold data-[state=active]:shadow-sm"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            courseInfo={courseInfo}
            clos={clos}
            weeklyPlan={weeklyPlan}
            assessments={assessments}
            status={status}
            courseTotalSlt={courseTotalSlt}
            onEditCourseInfo={() => {
              if (!editingLocked) setActiveTab("courseInfo");
              else setError("This course specification is locked while it is in the review workflow.");
            }}
            onGoToTab={(id) => setActiveTab(id)}
            readOnly={editingLocked}
          />
        </TabsContent>

        <TabsContent value="courseInfo" className="mt-4">
          <CourseInfoSection
            value={courseInfo}
            onChange={(patch) => setCourseInfo((current) => ({ ...current, ...patch }))}
            ready={status.courseInfo === "complete"}
            saving={saving}
            saved={courseInfoSavedFlash}
            onSave={() => saveSection("courseInfo")}
          />
        </TabsContent>

        <TabsContent value="clos" className="mt-4">
          <ClosSection
            value={clos}
            courseId={courseId}
            lastSavedAt={closSavedAt}
            programme={programme}
            ready={cloReady}
            onPersist={persistClos}
          />
        </TabsContent>

        <TabsContent value="teachingLearning" className="mt-4">
          <TeachingLearningSection
            value={clos}
            teachingMethods={teachingMethods}
            onPersist={persistClos}
            onProfileSaved={setTeachingLearningProfile}
          />
        </TabsContent>

        <TabsContent value="slt" className="mt-4">
          <WeeklyPlanSectionForm
            value={weeklyPlan}
            onPersist={persistWeeklyPlan}
            courseId={courseId}
            courseName={`${course.code} - ${course.title}`}
            ready={status.slt === "complete"}
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
            ready={status.assessmentPlan === "complete"}
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
            courseName={`${course.code} - ${course.title}`}
          />
        </TabsContent>

        <TabsContent value="resources" className="mt-4">
          <LearningResourcesSection
            references={references}
            resources={resources}
            weeklyPlan={weeklyPlan}
            onPersistReferences={persistReferences}
            onPersistResources={persistResources}
            onGoToWeeklyPlan={() => setActiveTab("slt")}
          />
        </TabsContent>

        <TabsContent value="policy" className="mt-4">
          <PoliciesResponsibilitiesSection
            policy={policy}
            responsibility={responsibility}
            programPolicy={programme?.policy ?? null}
            onPersistPolicy={persistPolicy}
            onPersistResponsibility={persistResponsibility}
            disabled={editingLocked}
          />
        </TabsContent>

        <TabsContent value="documentPreview" className="mt-4" forceMount>
          <DocumentPreview document={courseDocument} />
        </TabsContent>

        <TabsContent value="reviewSubmit" className="mt-4">
          {review ? (
            <ReviewSubmitSection
              course={course}
              status={status}
              review={review}
              cloReady={cloReady}
              teachingLearningReady={teachingLearningReady}
              specificationDate={specDate}
              onSaveSpecificationDate={persistDate}
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
            {savedFlash ? <span className="text-sm text-emerald-600">Saved ✓</span> : null}
            <Button
              variant="outline"
              onClick={() => void saveSection("mapping")}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}
      </Tabs>
    </div>
  );
}
