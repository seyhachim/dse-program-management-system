import {
  PROGRAMME_TITLE,
  courseTypeLabel,
  semesterLabel,
  cloFocusCode,
  cloFocusPercent,
  rubricScaleSummary,
  type DateSection as DateSectionValue,
  type Method,
  type PolicySection as PolicySectionValue,
  type ProgrammeAcademicConfig,
  type ProgrammeGradingScaleVersion,
  type Rubric,
  type StudentResponsibilitySection as StudentResponsibilityValue,
  type TeachingLearningProfile,
} from "@dse-pms/shared-types";

import type { CourseInfoForm } from "./course-info-section";
import type { CloForm } from "./clo-model";
import {
  instructionalWeeklyPlan,
  weekContactHoursForm,
  weekSltForm,
  type WeeklyPlanForm,
} from "./weekly-plan-model";
import { assessmentSltHours, type AssessmentForm } from "./assessment-model";
import type { MappingForm } from "./mapping-model";
import type { ResourcesForm } from "./resources-model";
import type { ReferencesForm } from "./references-model";
import { courseDocumentCloSltHours } from "./course-document-mapping";
import { normalizeCourseDocumentTopic } from "./course-document-topic";

export type CourseDocumentModel = {
  title: string;
  partTitle: string;
  programmeProfile: ProgrammeAcademicConfig["profile"];
  gradingScale: ProgrammeGradingScaleVersion | null;
  specDate: string | null;
  plos: ProgrammeAcademicConfig["plos"];
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
    focusPercent: number | null;
    focusCode: string;
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
  requiredDeliveryResources: string[];
  teachingLearningMaterials: string[];
  resources: {
    id: string;
    resourceType: string;
    title: string;
    url: string;
    notes: string;
  }[];
  references: {
    id: string;
    kind: string;
    title: string;
    authors: string;
    publisher: string;
    year: string;
    isbn: string;
    url: string;
    basedOn: string;
    notes: string;
  }[];
  responsibilities: string[];
  policy: {
    attendancePreparation: string;
    academicIntegrity: string;
    assignmentsLateSubmission: string;
    examinationRules: string;
    penaltiesConsequences: string;
  };
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
    evaluationDefinition: string;
    rubricName: string;
    rubricUrl: string;
    assessmentCategory: "continuous" | "final";
    topicNumbers: number[];
    physicalSltHours: string;
    onlineSltHours: string;
    independentSltHours: string;
    totalSltHours: number;
  }[];
  rubrics: {
    assessmentName: string;
    name: string;
    type: string;
    scaleSummary: string;
    levels: { label: string; points: number }[];
    criteria: { name: string; descriptors: string[] }[];
  }[];
  totals: {
    courseContentSlt: number;
    continuousAssessmentSlt: number;
    finalAssessmentSlt: number;
    assessmentSlt: number;
    grandSlt: number;
    assessmentWeight: number;
  };
};

export const COURSE_DOCUMENT_STYLE = {
  fontFamily: "Times New Roman",
  colors: {
    labelBackground: "#E2EEDB",
    tableHeaderBackground: "#E2EEDB",
    border: "#000000",
    link: "#0563C1",
  },
  labelBackground: "#E2EEDB",
  borderColor: "#000000",
  fontSize: {
    body: 10,
    small: 9,
    compact: 8,
    heading: 14,
    title: 14,
    institution: 11,
    faculty: 10,
    programme: 10,
    footer: 8,
    profileBody: 9,
    profileHeading: 10,
  },
  lineHeight: { body: 1.25, compact: 1.2, profile: 1.2 },
  spacing: {
    paragraphAfterPt: 2,
    centeredAfterPt: 1,
    sectionBeforePt: 4,
    sectionAfterPt: 4,
    tableCellVerticalPt: 3,
    tableCellHorizontalPt: 4,
  },
  page: {
    orientation: "landscape",
    preview: {
      width: 1056,
      height: 816,
      paddingX: 54,
      paddingY: 42,
      programmePaddingX: 54,
      programmePaddingY: 42,
      programmeTableMarginX: 25,
      footerBottom: 24,
      footerHorizontal: 54,
    },
    word: {
      widthTwips: 15840,
      heightTwips: 12240,
      marginTopTwips: 720,
      marginBottomTwips: 720,
      marginLeftTwips: 720,
      marginRightTwips: 720,
    },
  },
  logo: { width: 90, height: 90 },
  title: "COURSE SPECIFICATION",
  partTitle: "PART 2: COURSE DETAILS",
  courseInfoTitle: "Course Information",
} as const;

type BuildCourseDocumentInput = {
  courseInfo: CourseInfoForm;
  courseId: string;
  clos: CloForm[];
  weeklyPlan: WeeklyPlanForm;
  assessments: AssessmentForm[];
  rubrics?: Rubric[];
  mapping: MappingForm;
  teachingMethods?: Method[];
  assessmentMethods?: Method[];
  programme?: ProgrammeAcademicConfig | null;
  gradingScale?: ProgrammeGradingScaleVersion | null;
  teachingLearningProfile?: TeachingLearningProfile;
  resources?: ResourcesForm;
  references?: ReferencesForm;
  responsibility?: StudentResponsibilityValue;
  policy?: PolicySectionValue;
  specDate?: DateSectionValue;
  courseTotalSlt?: number | null;
};

const EMPTY_POLICY_VALUES: PolicySectionValue = {
  attendancePreparation: "",
  academicIntegrity: "",
  assignmentsLateSubmission: "",
  examinationRules: "",
  penaltiesConsequences: "",
};

const EMPTY_TEACHING_LEARNING_PROFILE: TeachingLearningProfile = {
  philosophyTags: [],
  philosophyStatement: "",
  teachingMethodIds: [],
  activeLearningStrategyIds: [],
  independentLearningTypes: [],
  resourceTypes: [],
  technologyTypes: [],
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
  courseId,
  clos,
  weeklyPlan,
  assessments,
  rubrics = [],
  mapping: _mapping,
  teachingMethods = [],
  assessmentMethods = [],
  programme = null,
  gradingScale = null,
  teachingLearningProfile = EMPTY_TEACHING_LEARNING_PROFILE,
  resources = [],
  references = [],
  responsibility,
  policy,
  specDate,
  courseTotalSlt = null,
}: BuildCourseDocumentInput): CourseDocumentModel {
  const ploByCode = new Map((programme?.plos ?? []).map((plo) => [plo.code, plo.description]));
  const activeClos = clos.filter((clo) => clo.status === "active");

  const documentClos = activeClos.map((clo) => ({
    code: clo.code,
    outcome: clo.description,
    level: clo.level,
    mappedPlos: clo.mappedPlos,
    mappedPloDescriptions: clo.mappedPlos.map((code) => ploByCode.get(code) ?? "").filter(Boolean),
    sltHours: clo.sltHours,
    teachingMethods: methodNames(clo.teachingMethodIds, teachingMethods),
    assessmentMethods: methodNames(clo.assessmentMethodIds, assessmentMethods),
  }));

  const documentWeeks = instructionalWeeklyPlan(weeklyPlan).map((week, index) => {
    const displayWeek = String(index + 1);
    const contact = weekContactHoursForm(week);
    const slt = weekSltForm(week);
    const learningActivities = week.studentLearningActivities.map((activity) =>
      activity.description.trim() ? `${activity.title}: ${activity.description}` : activity.title,
    );
    const lloItems = week.lessonLearningOutcomes.map((llo) => llo.description.trim()).filter(Boolean);
    return {
      id: week.id,
      week: displayWeek,
      topic: normalizeCourseDocumentTopic(displayWeek, week.topic),
      cloCodes: week.cloCodes,
      lloItems,
      learningActivities: learningActivities.length > 0 ? learningActivities : week.activities,
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

  const rubricById = new Map(rubrics.map((rubric) => [rubric.id, rubric]));
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
      evaluationDefinition: rubricById.get(assessment.rubricId)?.description ?? "",
      rubricName: rubricById.get(assessment.rubricId)?.name ?? "",
      rubricUrl: assessment.rubricId
        ? `/courses/${encodeURIComponent(courseId)}/spec/assessment/rubrics/${encodeURIComponent(assessment.rubricId)}/edit`
        : "",
      assessmentCategory: assessment.assessmentCategory,
      topicNumbers: assessment.topicNumbers,
      physicalSltHours: assessment.physicalSltHours,
      onlineSltHours: assessment.onlineSltHours,
      independentSltHours: assessment.independentSltHours,
      totalSltHours: assessmentSltHours(assessment),
    }));

  const weeklyPlanSlt = documentWeeks.reduce(
    (sum, week) => sum + (Number(week.sltHours) || 0),
    0,
  );
  const continuousAssessmentSlt = documentAssessments
    .filter((assessment) => assessment.assessmentCategory === "continuous")
    .reduce((sum, assessment) => sum + assessment.totalSltHours, 0);
  const finalAssessmentSlt = documentAssessments
    .filter((assessment) => assessment.assessmentCategory === "final")
    .reduce((sum, assessment) => sum + assessment.totalSltHours, 0);
  const assessmentSlt = continuousAssessmentSlt + finalAssessmentSlt;
  const courseContentSlt = weeklyPlanSlt;
  const derivedGrandSlt = courseContentSlt + assessmentSlt;
  const snapshotTotalSlt =
    courseInfo.totalSltHours === undefined ? courseTotalSlt : courseInfo.totalSltHours;
  const focusDenominator = snapshotTotalSlt && snapshotTotalSlt > 0
    ? snapshotTotalSlt
    : derivedGrandSlt > 0
      ? derivedGrandSlt
      : null;

  const documentMapping = activeClos.map((clo) => {
    const sltHours = courseDocumentCloSltHours(
      clo.code,
      documentWeeks,
      documentAssessments,
      clo.sltHours,
    );
    const focusPercent = cloFocusPercent(
      sltHours ? Number(sltHours) : null,
      focusDenominator,
    );
    const assessmentNames = unique(
      documentAssessments
        .filter((assessment) => assessment.cloCodes.includes(clo.code))
        .map((assessment) => assessment.name),
    );
    return {
      cloCode: clo.code,
      ploCodes: clo.mappedPlos,
      level: clo.level,
      teachingMethods: methodNames(clo.teachingMethodIds, teachingMethods),
      assessmentMethods:
        assessmentNames.length > 0
          ? assessmentNames
          : methodNames(clo.assessmentMethodIds, assessmentMethods),
      sltHours,
      focusPercent,
      focusCode: cloFocusCode(focusPercent) ?? "",
    };
  });

  const documentRubrics = assessments
    .filter((assessment) => assessment.status === "active")
    .flatMap((assessment) => {
      const rubric = rubricById.get(assessment.rubricId);
      if (!rubric) return [];
      return [{
        assessmentName: assessment.name,
        name: rubric.name,
        type: rubric.type,
        scaleSummary: rubricScaleSummary(rubric.levels),
        levels: rubric.levels.map((level) => ({ label: level.label, points: level.points })),
        criteria: rubric.criteria.map((criterion) => ({
          name: criterion.name,
          descriptors: criterion.descriptors,
        })),
      }];
    });

  const assessmentWeight = documentAssessments.reduce(
    (sum, assessment) => sum + (Number(assessment.weight) || 0),
    0,
  );

  return {
    title: COURSE_DOCUMENT_STYLE.title,
    partTitle: COURSE_DOCUMENT_STYLE.partTitle,
    programmeProfile: programme?.profile ?? {
      vision: "",
      mission: [],
      goals: [],
      educationalPhilosophy: [],
      peos: [],
    },
    gradingScale,
    specDate: specDate?.date ?? null,
    plos: programme?.plos ?? [],
    courseInformation: {
      programmeTitle: courseInfo.programmeTitle || programme?.title || PROGRAMME_TITLE,
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
    requiredDeliveryResources: unique(teachingLearningProfile.technologyTypes),
    teachingLearningMaterials: unique(teachingLearningProfile.resourceTypes),
    resources: resources.map((resource) => ({
      id: resource.id,
      resourceType: resource.resourceType,
      title: resource.title,
      url: resource.url,
      notes: resource.notes,
    })),
    references: references.map((reference) => ({
      id: reference.id,
      kind: reference.kind,
      title: reference.title,
      authors: reference.authors,
      publisher: reference.publisher,
      year: reference.year,
      isbn: reference.isbn,
      url: reference.url,
      basedOn: reference.basedOn,
      notes: reference.notes,
    })),
    responsibilities: (responsibility?.items ?? [])
      .map((item) => item.text.trim())
      .filter(Boolean),
    policy: policy ?? EMPTY_POLICY_VALUES,
    assessments: documentAssessments,
    rubrics: documentRubrics,
    totals: {
      courseContentSlt,
      continuousAssessmentSlt,
      finalAssessmentSlt,
      assessmentSlt,
      grandSlt: derivedGrandSlt,
      assessmentWeight,
    },
  };
}