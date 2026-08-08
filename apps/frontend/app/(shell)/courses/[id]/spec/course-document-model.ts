import {
  PROGRAMME_TITLE,
  courseTypeLabel,
  semesterLabel,
  type Method,
  type ProgrammeAcademicConfig,
} from "@dse-pms/shared-types";

import type { CourseInfoForm } from "./course-info-section";
import type { CloForm } from "./clo-model";
import { weekContactHoursForm, weekSltForm, type WeeklyPlanForm } from "./weekly-plan-model";
import type { AssessmentForm } from "./assessment-model";
import type { MappingForm } from "./mapping-model";
import type { ResourcesForm } from "./resources-model";

export type CourseDocumentModel = {
  title: string;
  partTitle: string;
  courseInformation: {
    programmeTitle: string;
    courseTitle: string;
    courseCode: string;
    credits: string;
    prerequisites: string;
    instructor: string;
    qualification: string;
    email: string;
    telephone: string;
    otherLecturers: string;
    courseType: string;
    semester: string;
    programmeYear: string;
    description: string;
  };
  clos: {
    code: string;
    outcome: string;
    level: string;
    mappedPlos: string[];
    mappedPloDescriptions: string[];
    sltHours: string;
    teachingMethods: string[];
    assessmentMethods: string[];
  }[];
  mapping: {
    cloCode: string;
    ploCodes: string[];
    level: string;
    teachingMethods: string[];
    assessmentMethods: string[];
    sltHours: string;
  }[];
  weeklyPlan: {
    id: string;
    week: string;
    topic: string;
    cloCodes: string[];
    lloItems: string[];
    learningActivities: string[];
    teachingMethods: string[];
    activeLearningStrategies: string[];
    assessmentMethods: string[];
    resources: string[];
    lectureHours: string;
    tutorialHours: string;
    practiceHours: string;
    otherHours: string;
    selfStudyHours: string;
    contactHours: string;
    sltHours: string;
    assessment: string;
  }[];
  resources: {
    id: string;
    resourceType: string;
    title: string;
    url: string;
    notes: string;
    evidenceWeeks: string[];
  }[];
  references: {
    id: string;
    kind: "required" | "recommended" | "other";
    title: string;
    authors: string;
    publisher: string;
    year: string;
    isbn: string;
    url: string;
    basedOn: string;
    notes: string;
  }[];
  assessments: {
    id: string;
    name: string;
    type: string;
    description: string;
    mode: string;
    cloCodes: string[];
    mappedPlos: string[];
    capLevels: string[];
    weight: string;
    dueWeek: string;
    durationWeeks: string;
    format: string;
    submissionMethod: string;
    feedbackMethod: string;
    feedbackTimeline: string;
  }[];
  totals: {
    courseContentSlt: number;
    assessmentSlt: number | null;
    grandSlt: number | null;
    assessmentWeight: number;
  };
};

export const COURSE_DOCUMENT_STYLE = {
  labelBackground: "#E2EEDB",
  borderColor: "#000000",
  fontFamily: "Arial",
  title: "COURSE SPECIFICATION",
  partTitle: "PART 2: COURSE DETAILS",
  courseInfoTitle: "Course Information",
} as const;

type BuildCourseDocumentInput = {
  courseInfo: CourseInfoForm;
  clos: CloForm[];
  weeklyPlan: WeeklyPlanForm;
  assessments: AssessmentForm[];
  mapping: MappingForm;
  resources: ResourcesForm;
  teachingMethods?: Method[];
  assessmentMethods?: Method[];
  programme?: ProgrammeAcademicConfig | null;
};

type CourseType = "Basic" | "Core" | "Elective" | "Specialization" | "MoeysHeip";
type Semester = "First" | "Second";

function isCourseType(value: string): value is CourseType {
  return ["Basic", "Core", "Elective", "Specialization", "MoeysHeip"].includes(value);
}

function isSemester(value: string): value is Semester {
  return value === "First" || value === "Second";
}

function methodNames(ids: string[], methods: Method[]): string[] {
  const names = new Map(methods.map((method) => [method.id, method.name]));
  return ids.map((id) => names.get(id) ?? id).filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function buildCourseDocument({
  courseInfo,
  clos,
  weeklyPlan,
  assessments,
  mapping: _mapping,
  resources,
  teachingMethods = [],
  assessmentMethods = [],
  programme = null,
}: BuildCourseDocumentInput): CourseDocumentModel {
  const ploByCode = new Map(
    (programme?.plos ?? []).map((plo) => [plo.code, plo.description]),
  );

  const activeClos = clos.filter((clo) => clo.status === "active");

  const documentClos = activeClos.map((clo) => ({
    code: clo.code,
    outcome: clo.description,
    level: clo.level,
    mappedPlos: clo.mappedPlos,
    mappedPloDescriptions: clo.mappedPlos
      .map((code) => ploByCode.get(code) ?? "")
      .filter(Boolean),
    sltHours: clo.sltHours,
    teachingMethods: methodNames(clo.teachingMethodIds, teachingMethods),
    assessmentMethods: methodNames(clo.assessmentMethodIds, assessmentMethods),
  }));

  const weekById = new Map(weeklyPlan.map((week) => [week.id, week]));
  const evidenceWeeks = (weekIds: string[]) => weekIds
    .map((weekId) => weekById.get(weekId))
    .filter((week): week is WeeklyPlanForm[number] => Boolean(week))
    .map((week) => `Week ${week.week}${week.topic ? ` — ${week.topic}` : ""}`);

  // §19 contains only confirmed delivery requirements. Other resource kinds
  // project into §20, while legacy CourseSpecReference rows are preserved.
  const documentResources = resources
    .filter((resource) => resource.kind === "requiredResource")
    .map((resource) => ({
      id: resource.id,
      resourceType: resource.resourceType,
      title: resource.title,
      url: resource.url,
      notes: resource.notes,
      evidenceWeeks: evidenceWeeks(resource.evidenceWeekIds),
    }));

  const resourceReferences = resources
    .filter((resource) => resource.kind !== "requiredResource")
    .map((resource) => ({
      id: resource.id,
      kind: resource.kind === "requiredTextbook" ? "required" as const : resource.kind === "recommendedReading" ? "recommended" as const : "other" as const,
      title: resource.title,
      authors: resource.authors,
      publisher: resource.publisher,
      year: resource.year,
      isbn: resource.isbn,
      url: resource.url,
      basedOn: resource.basedOn,
      notes: resource.notes,
    }));

  const documentReferences = resourceReferences;

  const documentWeeks = weeklyPlan.map((week) => {
    const contact = weekContactHoursForm(week);
    const slt = weekSltForm(week);
    const learningActivities = week.studentLearningActivities.map((activity) =>
      activity.description.trim()
        ? `${activity.title}: ${activity.description}`
        : activity.title,
    );
    const lloItems = week.lessonLearningOutcomes
      .map((llo) => llo.description.trim())
      .filter(Boolean);

    return {
      id: week.id,
      week: week.week,
      topic: week.topic,
      cloCodes: week.cloCodes,
      lloItems,
      learningActivities:
        learningActivities.length > 0 ? learningActivities : week.activities,
      teachingMethods: methodNames(week.teachingMethodIds, teachingMethods),
      activeLearningStrategies: week.studentLearningActivities.map((activity) => activity.title),
      assessmentMethods: methodNames(week.assessmentMethodIds, assessmentMethods),
      resources: week.teachingResourceTypes,
      lectureHours: week.lectureHours,
      tutorialHours: week.tutorialHours,
      practiceHours: week.practiceHours,
      otherHours: week.otherHours,
      selfStudyHours: week.selfStudyHours,
      contactHours: contact > 0 ? String(contact) : "",
      sltHours: slt > 0 ? String(slt) : "",
      assessment: week.assessment,
    };
  });

  const documentAssessments = assessments
    .filter((assessment) => assessment.status === "active")
    .map((assessment) => ({
      id: assessment.id,
      name: assessment.name,
      type: assessment.type,
      description: assessment.description,
      mode: assessment.mode,
      cloCodes: assessment.cloCodes,
      mappedPlos: unique(
        assessment.mappedPlos.length > 0
          ? assessment.mappedPlos
          : assessment.cloCodes.flatMap(
              (code) => activeClos.find((clo) => clo.code === code)?.mappedPlos ?? [],
            ),
      ),
      capLevels: unique(
        assessment.cloCodes.map(
          (code) => activeClos.find((clo) => clo.code === code)?.level ?? "",
        ),
      ),
      weight: assessment.weight,
      dueWeek: assessment.dueWeek,
      durationWeeks: assessment.durationWeeks,
      format: assessment.format,
      submissionMethod: assessment.submissionMethod,
      feedbackMethod: assessment.feedbackMethod,
      feedbackTimeline: assessment.feedbackTimeline,
    }));

  const documentMapping = activeClos.map((clo) => ({
    cloCode: clo.code,
    ploCodes: clo.mappedPlos,
    level: clo.level,
    teachingMethods: methodNames(clo.teachingMethodIds, teachingMethods),
    assessmentMethods: methodNames(clo.assessmentMethodIds, assessmentMethods),
    sltHours: clo.sltHours,
  }));

  const courseContentSlt = documentWeeks.reduce(
    (sum, week) => sum + (Number(week.sltHours) || 0),
    0,
  );
  const assessmentWeight = documentAssessments.reduce(
    (sum, assessment) => sum + (Number(assessment.weight) || 0),
    0,
  );

  return {
    title: COURSE_DOCUMENT_STYLE.title,
    partTitle: COURSE_DOCUMENT_STYLE.partTitle,
    courseInformation: {
      programmeTitle: PROGRAMME_TITLE,
      courseTitle: courseInfo.courseTitle,
      courseCode: courseInfo.courseCode,
      credits: courseInfo.credits,
      prerequisites: courseInfo.prerequisites,
      instructor: courseInfo.instructorName,
      qualification: courseInfo.qualification,
      email: courseInfo.email,
      telephone: courseInfo.telephone,
      otherLecturers: courseInfo.otherLecturers,
      courseType: isCourseType(courseInfo.courseType) ? courseTypeLabel(courseInfo.courseType) : "",
      semester: isSemester(courseInfo.semester) ? semesterLabel(courseInfo.semester) : "",
      programmeYear: courseInfo.programmeYear,
      description: courseInfo.description,
    },
    clos: documentClos,
    mapping: documentMapping,
    weeklyPlan: documentWeeks,
    resources: documentResources,
    references: documentReferences,
    assessments: documentAssessments,
    totals: {
      courseContentSlt,
      assessmentSlt: null,
      grandSlt: null,
      assessmentWeight,
    },
  };
}
