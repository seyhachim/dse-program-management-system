import {
  PROGRAMME_TITLE,
  courseTypeLabel,
  semesterLabel,
  type Method,
  type ProgrammeAcademicConfig,
  type Rubric,
} from "@dse-pms/shared-types";

import type { CourseInfoForm } from "./course-info-section";
import type { CloForm } from "./clo-model";
import { weekContactHoursForm, weekSltForm, type WeeklyPlanForm } from "./weekly-plan-model";
import type { AssessmentForm } from "./assessment-model";
import type { MappingForm } from "./mapping-model";

export type CourseDocumentModel = {
  title: string;
  partTitle: string;
  programmeProfile: ProgrammeAcademicConfig["profile"];
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
  }[];
  totals: {
    courseContentSlt: number;
    assessmentSlt: number | null;
    grandSlt: number | null;
    assessmentWeight: number;
  };
};

/**
 * Single source of truth for Course Specification presentation.
 *
 * Keep content/data decisions out of this object. It only controls how the
 * same CourseDocumentModel is presented in the browser preview and Word export.
 * Font sizes are expressed in points so both renderers use the same unit.
 */
export const COURSE_DOCUMENT_STYLE = {
  fontFamily: "Arial",

  colors: {
    labelBackground: "#E2EEDB",
    tableHeaderBackground: "#F2F2F2",
    border: "#000000",
    link: "#0563C1",
  },

  // Backward-compatible aliases for existing renderers. These remain part of
  // the same configuration until the preview/export consumers are migrated.
  labelBackground: "#E2EEDB",
  borderColor: "#000000",

  fontSize: {
    body: 10,
    small: 9,
    compact: 8,
    heading: 14,
    title: 16,
    institution: 11,
    faculty: 10,
    programme: 10,
    footer: 8,
    profileBody: 9,
    profileHeading: 11,
  },

  lineHeight: {
    body: 1.3,
    compact: 1.25,
    profile: 1.25,
  },

  spacing: {
    paragraphAfterPt: 3,
    centeredAfterPt: 2,
    sectionBeforePt: 6,
    sectionAfterPt: 5,
    tableCellVerticalPt: 3.5,
    tableCellHorizontalPt: 4.5,
  },

  page: {
    orientation: "landscape",
    preview: {
      width: 1123,
      height: 794,
      paddingX: 54,
      paddingY: 42,
      programmePaddingX: 62,
      programmePaddingY: 30,
      footerBottom: 24,
      footerHorizontal: 54,
    },
    word: {
      widthTwips: 11906,
      heightTwips: 8391,
      marginTopTwips: 720,
      marginBottomTwips: 720,
      marginLeftTwips: 900,
      marginRightTwips: 900,
    },
  },

  logo: {
    width: 86,
    height: 86,
  },

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
      evaluationDefinition: rubricById.get(assessment.rubric)?.description ?? "",
      rubricName: rubricById.get(assessment.rubric)?.name ?? "",
      rubricUrl: assessment.rubric
        ? `/courses/${encodeURIComponent(courseId)}/spec/assessment/rubrics/${encodeURIComponent(assessment.rubric)}/edit`
        : "",
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
    programmeProfile: programme?.profile ?? {
      vision: "",
      mission: [],
      goals: [],
      educationalPhilosophy: [],
      peos: [],
    },
    courseInformation: {
      programmeTitle: programme?.title ?? PROGRAMME_TITLE,
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
    assessments: documentAssessments,
    totals: {
      courseContentSlt,
      assessmentSlt: null,
      grandSlt: null,
      assessmentWeight,
    },
  };
}
