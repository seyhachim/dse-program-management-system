"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  teachingLearningIsReady,
  type CourseSpecReviewStatus,
  type Method,
  type ProgrammeAcademicConfig,
  type Rubric,
  type SpecSectionId,
  type SpecSectionStatus,
  type TeachingLearningProfile,
} from "@dse-pms/shared-types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { courseSpecApi } from "@/lib/course-spec";
import { coursesApi, type CourseView } from "@/lib/courses";
import { methodsApi } from "@/lib/methods";
import { rubricsApi } from "@/lib/rubrics";
import {
  EMPTY_TEACHING_LEARNING_PROFILE,
  teachingLearningApi,
} from "@/lib/teaching-learning";
import {
  EMPTY_ASSESSMENTS,
  AssessmentSection,
  toAssessmentForm,
  type AssessmentForm,
} from "./assessment-section";
import {
  EMPTY_CLOS,
  ClosSection,
  toClosForm,
  type CloForm,
} from "./clos-section";
import {
  CourseInfoSection,
  EMPTY_COURSE_INFO,
  toCourseInfoForm,
  type CourseInfoForm,
} from "./course-info-section";
import { buildCourseDocument } from "./course-document-model";
import { CourseSpecReadOnlyBoundary } from "./course-spec-readonly-boundary";
import { EMPTY_DATE } from "./date-section";
import { DocumentPreview } from "./document-preview";
import {
  EMPTY_MAPPING,
  toMappingForm,
  type MappingForm,
} from "./mapping-model";
import { MappingSection } from "./mapping-section";
import { OverviewTab } from "./overview-tab";
import { EMPTY_POLICY } from "./policy-section";
import {
  normalizePoliciesResponsibilitiesTab,
} from "./policies-responsibilities-model";
import { PoliciesResponsibilitiesSection } from "./policies-responsibilities-section";
import {
  EMPTY_REFERENCES,
  toReferencesForm,
  type ReferencesForm,
} from "./references-model";
import { ReferencesSectionForm } from "./references-section";
import { ResourcesSectionForm } from "./resources-section";
import {
  EMPTY_RESOURCES,
  toResourcesForm,
  type ResourcesForm,
} from "./resources-model";
import { ReviewSubmitSection } from "./review-submit-section";
import { EMPTY_STUDENT_RESPONSIBILITY } from "./student-responsibility-section";
import { TeachingLearningSection } from "./teaching-learning-section";
import {
  EMPTY_WEEKLY_PLAN,
  toWeeklyPlanForm,
  WeeklyPlanSectionForm,
  type WeeklyPlanForm,
} from "./weekly-plan-section";
import type {
  DateSection as DateSectionValue,
  PolicySection as PolicySectionValue,
  StudentResponsibilitySection as StudentResponsibilityValue,
} from "@dse-pms/shared-types";

type TabId =
  | "overview"
  | "teachingLearning"
  | "documentPreview"
  | "reviewSubmit"
  | SpecSectionId;

type ReviewState = NonNullable<
  Awaited<ReturnType<typeof courseSpecApi.get>>["review"]
>;

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "courseInfo", label: "Course Information" },
  { id: "clos", label: "CLOs" },
  { id: "teachingLearning", label: "Teaching & Learning" },
  { id: "assessmentPlan", label: "Assessment" },
  { id: "slt", label: "Weekly Plan" },
  { id: "mapping", label: "Constructive Alignment" },
  { id: "resources", label: "Resources" },
  { id: "references", label: "References" },
  { id: "policy", label: "Policies & Responsibilities" },
  { id: "documentPreview", label: "Document Preview" },
  { id: "reviewSubmit", label: "Review & Submit" },
];

const BANNER_COPY: Partial<
  Record<CourseSpecReviewStatus, { title: string; body: string }>
> = {
  submitted: {
    title: "Submitted · Read-only",
    body: "This version has been submitted for review. You can inspect every section, but editing is temporarily locked.",
  },
  underReview: {
    title: "Under review · Read-only",
    body: "This version is being reviewed. You can inspect every section, but editing is temporarily locked.",
  },
  resubmitted: {
    title: "Resubmitted · Read-only",
    body: "The requested changes have been resubmitted. You can inspect every section while this version waits for review.",
  },
  approved: {
    title: "Approved · Read-only",
    body: "This approved version is locked for editing. You can review every section below. Create a revision to make changes.",
  },
};

const rejectMutation = async () => false;

export function ReadOnlySpecClient({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { me } = useMe();

  const [activeTab, setActiveTabState] = useState<TabId>(() => {
    const requested = normalizePoliciesResponsibilitiesTab(
      searchParams.get("tab"),
    );
    return TABS.some((tab) => tab.id === requested)
      ? (requested as TabId)
      : "overview";
  });
  const [course, setCourse] = useState<CourseView | null>(null);
  const [status, setStatus] = useState<Record<string, SpecSectionStatus>>({});
  const [review, setReview] = useState<ReviewState | null>(null);
  const [courseInfo, setCourseInfo] =
    useState<CourseInfoForm>(EMPTY_COURSE_INFO);
  const [clos, setClos] = useState<CloForm[]>(EMPTY_CLOS);
  const [weeklyPlan, setWeeklyPlan] =
    useState<WeeklyPlanForm>(EMPTY_WEEKLY_PLAN);
  const [assessments, setAssessments] =
    useState<AssessmentForm[]>(EMPTY_ASSESSMENTS);
  const [mapping, setMapping] = useState<MappingForm>(EMPTY_MAPPING);
  const [policy, setPolicy] = useState<PolicySectionValue>(EMPTY_POLICY);
  const [specDate, setSpecDate] = useState<DateSectionValue>(EMPTY_DATE);
  const [resources, setResources] = useState<ResourcesForm>(EMPTY_RESOURCES);
  const [references, setReferences] =
    useState<ReferencesForm>(EMPTY_REFERENCES);
  const [responsibility, setResponsibility] =
    useState<StudentResponsibilityValue>(EMPTY_STUDENT_RESPONSIBILITY);
  const [teachingMethods, setTeachingMethods] = useState<Method[]>([]);
  const [assessmentMethods, setAssessmentMethods] = useState<Method[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [programme, setProgramme] = useState<ProgrammeAcademicConfig | null>(
    null,
  );
  const [teachingLearningProfile, setTeachingLearningProfile] =
    useState<TeachingLearningProfile>(EMPTY_TEACHING_LEARNING_PROFILE);
  const [courseTotalSlt, setCourseTotalSlt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setActiveTab = useCallback(
    (id: TabId) => {
      const normalizedId = normalizePoliciesResponsibilitiesTab(id) as TabId;
      setActiveTabState(normalizedId);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (normalizedId === "overview") url.searchParams.delete("tab");
        else url.searchParams.set("tab", normalizedId);
        window.history.replaceState(
          window.history.state,
          "",
          `${pathname}${url.search}${url.hash}`,
        );
      }
    },
    [pathname],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        spec,
        methods,
        courseView,
        programmeConfig,
        rubricList,
        savedTeachingLearningProfile,
      ] = await Promise.all([
        courseSpecApi.get(courseId),
        methodsApi.list(),
        coursesApi.get(courseId),
        api.get<ProgrammeAcademicConfig>("/api/programme"),
        rubricsApi.list().catch(() => [] as Rubric[]),
        teachingLearningApi
          .get(courseId)
          .catch(() => EMPTY_TEACHING_LEARNING_PROFILE),
      ]);

      if (!spec.review) {
        throw new Error("Course specification review state is unavailable.");
      }

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
      setSpecDate(
        (spec.data.date as DateSectionValue | undefined) ?? EMPTY_DATE,
      );
      setResources(toResourcesForm(spec.data.resources));
      setReferences(toReferencesForm(spec.data.references));
      setResponsibility(
        (spec.data.responsibility as
          | StudentResponsibilityValue
          | undefined) ?? EMPTY_STUDENT_RESPONSIBILITY,
      );
      setStatus(spec.status ?? {});
      setReview(spec.review);
      setTeachingMethods(methods.teaching);
      setAssessmentMethods(methods.assessment);
      setRubrics(rubricList);
      setCourse(courseView);
      setProgramme(programmeConfig);
      setTeachingLearningProfile(savedTeachingLearningProfile);
      setCourseTotalSlt(courseView.totalSltHours ?? null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load the course specification",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const canReview = me?.permissions.includes("courses:review") ?? false;

  const handleRequestChanges = useCallback(
    async (note: string) => {
      setReviewing(true);
      setError(null);
      try {
        await courseSpecApi.requestChanges(courseId, note);
        window.location.reload();
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to request changes",
        );
        return false;
      } finally {
        setReviewing(false);
      }
    },
    [courseId],
  );

  const handleApprove = useCallback(
    async (note: string) => {
      setReviewing(true);
      setError(null);
      try {
        const next = await courseSpecApi.approve(courseId, note);
        setStatus(next.status ?? {});
        setReview(next.review);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to approve course specification",
        );
        return false;
      } finally {
        setReviewing(false);
      }
    },
    [courseId],
  );

  const goToSection = useCallback(
    (sectionId: SpecSectionId) => {
      setActiveTab(sectionId);
    },
    [setActiveTab],
  );

  const breadcrumbLabel = course
    ? `${course.code} – ${course.title}`
    : "Course Specification";
  const activeTabLabel = TABS.find((tab) => tab.id === activeTab)?.label;
  const banner = review ? BANNER_COPY[review.status] : null;

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
        <h1 className="text-2xl font-bold text-foreground">
          Course Specification
        </h1>
        <p className="text-sm text-muted-foreground">
          Review the complete course specification in OBE format.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : review && course ? (
        <>
          {banner ? (
            <div className="rounded-lg border border-blue-200/70 bg-blue-50/60 px-3 py-2.5 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
              <span className="font-semibold">{banner.title}</span>{" "}
              {banner.body}
            </div>
          ) : null}

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as TabId)}
          >
            <div className="rounded-xl border border-border bg-card p-1.5 shadow-sm">
              <TabsList
                variant="line"
                className="flex w-full justify-start gap-1 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-4">
              <CourseSpecReadOnlyBoundary>
                <OverviewTab
                  courseInfo={courseInfo}
                  clos={clos}
                  weeklyPlan={weeklyPlan}
                  assessments={assessments}
                  status={status}
                  courseTotalSlt={courseTotalSlt}
                  onSaveCourseDescription={() => Promise.resolve(false)}
                  onGoToTab={(id) => setActiveTab(id)}
                  readOnly
                />
              </CourseSpecReadOnlyBoundary>
            </TabsContent>

            <TabsContent value="courseInfo" className="mt-4">
              <CourseSpecReadOnlyBoundary>
                <CourseInfoSection
                  value={courseInfo}
                  onChange={() => undefined}
                  ready={status.courseInfo === "complete"}
                  saving={false}
                  saved={false}
                  onSave={rejectMutation}
                />
              </CourseSpecReadOnlyBoundary>
            </TabsContent>

            <TabsContent value="clos" className="mt-4">
              <CourseSpecReadOnlyBoundary>
                <ClosSection
                  value={clos}
                  courseId={courseId}
                  lastSavedAt={null}
                  programme={programme}
                  ready={cloReady}
                  onPersist={rejectMutation}
                />
              </CourseSpecReadOnlyBoundary>
            </TabsContent>

            <TabsContent value="teachingLearning" className="mt-4">
              <CourseSpecReadOnlyBoundary>
                <TeachingLearningSection
                  value={clos}
                  teachingMethods={teachingMethods}
                  onPersist={rejectMutation}
                  onProfileSaved={setTeachingLearningProfile}
                />
              </CourseSpecReadOnlyBoundary>
            </TabsContent>

            <TabsContent value="assessmentPlan" className="mt-4">
              <CourseSpecReadOnlyBoundary>
                <AssessmentSection
                  value={assessments}
                  clos={clos}
                  courseId={courseId}
                  ready={status.assessmentPlan === "complete"}
                  onPersist={rejectMutation}
                />
              </CourseSpecReadOnlyBoundary>
            </TabsContent>

            <TabsContent value="slt" className="mt-4">
              <CourseSpecReadOnlyBoundary>
                <WeeklyPlanSectionForm
                  value={weeklyPlan}
                  onPersist={rejectMutation}
                  courseId={courseId}
                  courseName={`${course.code} - ${course.title}`}
                  ready={status.slt === "complete"}
                  clos={clos}
                  teachingMethods={teachingMethods}
                  assessmentMethods={assessmentMethods}
                />
              </CourseSpecReadOnlyBoundary>
            </TabsContent>

            <TabsContent value="mapping" className="mt-4">
              <CourseSpecReadOnlyBoundary>
                <MappingSection
                  clos={clos}
                  weeklyPlan={weeklyPlan}
                  assessments={assessments}
                  value={mapping}
                  onChange={() => undefined}
                  courseName={`${course.code} - ${course.title}`}
                />
              </CourseSpecReadOnlyBoundary>
            </TabsContent>

            <TabsContent value="resources" className="mt-4">
              <CourseSpecReadOnlyBoundary>
                <ResourcesSectionForm
                  value={resources}
                  weeklyPlan={weeklyPlan}
                  onPersist={rejectMutation}
                />
              </CourseSpecReadOnlyBoundary>
            </TabsContent>

            <TabsContent value="references" className="mt-4">
              <CourseSpecReadOnlyBoundary>
                <ReferencesSectionForm
                  value={references}
                  onPersist={rejectMutation}
                />
              </CourseSpecReadOnlyBoundary>
            </TabsContent>

            <TabsContent value="policy" className="mt-4">
              <PoliciesResponsibilitiesSection
                policy={policy}
                responsibility={responsibility}
                programPolicy={programme?.policy ?? null}
                onPersistPolicy={rejectMutation}
                onPersistResponsibility={rejectMutation}
                disabled
              />
            </TabsContent>

            <TabsContent value="documentPreview" className="mt-4" forceMount>
              <DocumentPreview document={courseDocument} />
            </TabsContent>

            <TabsContent value="reviewSubmit" className="mt-4">
              <ReviewSubmitSection
                course={course}
                status={status}
                review={review}
                cloReady={cloReady}
                teachingLearningReady={teachingLearningReady}
                specificationDate={specDate}
                onSaveSpecificationDate={rejectMutation}
                onSubmit={rejectMutation}
                onPreview={() => setActiveTab("documentPreview")}
                onGoToSection={goToSection}
                saving={reviewing}
                canReview={canReview}
                onRequestChanges={handleRequestChanges}
                onApprove={handleApprove}
              />
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}