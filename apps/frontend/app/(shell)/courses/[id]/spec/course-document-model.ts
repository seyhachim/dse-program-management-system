import {
  PROGRAMME_TITLE,
  courseTypeLabel,
  semesterLabel,
} from "@dse-pms/shared-types";

import type { CourseInfoForm } from "./course-info-section";
import type { CloForm } from "./clo-model";
import type { WeeklyPlanForm } from "./weekly-plan-model";
import type { AssessmentForm } from "./assessment-model";

/* -------------------------------------------------------------------------- */
/* Document model                                                             */
/* -------------------------------------------------------------------------- */

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
    sltHours: string;
  }[];

  weeklyPlan: {
    id: string;
    week: string;
    topic: string;
    cloCodes: string[];
    activities: string[];
    contactHours: string;
    selfStudyHours: string;
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
    bloomLevel: string;
    weight: string;
    dueWeek: string;
    durationWeeks: string;
    format: string;
    submissionMethod: string;
    mappedPlos: string[];
  }[];
};

/* -------------------------------------------------------------------------- */
/* Shared document appearance                                                 */
/* -------------------------------------------------------------------------- */

export const COURSE_DOCUMENT_STYLE = {
  labelBackground: "#E2EEDB",
  borderColor: "#000000",

  fontFamily: "Arial",

  title: "COURSE SPECIFICATION",
  partTitle: "PART 2: COURSE DETAILS",
  courseInfoTitle: "Course Information",
} as const;

/* -------------------------------------------------------------------------- */
/* Builder                                                                    */
/* -------------------------------------------------------------------------- */

type BuildCourseDocumentInput = {
  courseInfo: CourseInfoForm;
  clos: CloForm[];
  weeklyPlan: WeeklyPlanForm;
  assessments: AssessmentForm[];
};

type CourseType =
  | "Basic"
  | "Core"
  | "Elective"
  | "Specialization"
  | "MoeysHeip";

type Semester = "First" | "Second";

function isCourseType(value: string): value is CourseType {
  return ["Basic", "Core", "Elective", "Specialization", "MoeysHeip"].includes(
    value,
  );
}

function isSemester(value: string): value is Semester {
  return value === "First" || value === "Second";
}

export function buildCourseDocument({
  courseInfo,
  clos,
  weeklyPlan,
  assessments,
}: BuildCourseDocumentInput): CourseDocumentModel {
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

      courseType: isCourseType(courseInfo.courseType)
        ? courseTypeLabel(courseInfo.courseType)
        : "",

      semester: isSemester(courseInfo.semester)
        ? semesterLabel(courseInfo.semester)
        : "",

      programmeYear: courseInfo.programmeYear,

      description: courseInfo.description,
    },

    clos: clos.map((clo) => ({
      code: clo.code,
      outcome: clo.description,
      level: clo.level,
      mappedPlos: clo.mappedPlos,
      sltHours: clo.sltHours,
    })),

    weeklyPlan: weeklyPlan.map((week) => {
      const contact = Number(week.contactHours) || 0;
      const selfStudy = Number(week.selfStudyHours) || 0;
      const slt = contact + selfStudy;

      return {
        id: week.id,
        week: week.week,
        topic: week.topic,
        cloCodes: week.cloCodes,
        activities: week.activities,
        contactHours: week.contactHours,
        selfStudyHours: week.selfStudyHours,
        sltHours: slt > 0 ? String(slt) : "",
        assessment: week.assessment,
      };
    }),

    assessments: assessments.map((assessment) => ({
      id: assessment.id,
      name: assessment.name,
      type: assessment.type,
      description: assessment.description,
      mode: assessment.mode,
      cloCodes: assessment.cloCodes,
      bloomLevel: assessment.bloomLevel,
      weight: assessment.weight,
      dueWeek: assessment.dueWeek,
      durationWeeks: assessment.durationWeeks,
      format: assessment.format,
      submissionMethod: assessment.submissionMethod,
      mappedPlos: assessment.mappedPlos,
    })),
  };
}
