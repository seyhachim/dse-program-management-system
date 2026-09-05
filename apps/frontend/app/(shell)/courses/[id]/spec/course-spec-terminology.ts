import { isFinalProjectCourseCode } from "@dse-pms/shared-types";

export type CourseSpecTerminology = {
  projectBased: boolean;
  courseInformation: string;
  teachingLearning: string;
  weeklyPlan: string;
  policy: string;
  pageDescription: string;
  weekSingular: string;
  weekPlural: string;
  topic: string;
  learningOutcomes: string;
  teachingMethods: string;
  learningActivities: string;
  assessment: string;
  resources: string;
  detailedPlan: string;
};

const TAUGHT_COURSE_TERMINOLOGY: CourseSpecTerminology = {
  projectBased: false,
  courseInformation: "Course Information",
  teachingLearning: "Teaching & Learning",
  weeklyPlan: "Weekly Plan",
  policy: "Policies & Responsibilities",
  pageDescription: "Design and manage your course in OBE format.",
  weekSingular: "Week",
  weekPlural: "Weeks",
  topic: "Topic",
  learningOutcomes: "Lesson Learning Outcomes",
  teachingMethods: "Teaching Method / Activity",
  learningActivities: "Learning Activities",
  assessment: "Assessment",
  resources: "Teaching Resources",
  detailedPlan: "Course Outline / Detailed Lesson Plan",
};

const FINAL_PROJECT_TERMINOLOGY: CourseSpecTerminology = {
  projectBased: true,
  courseInformation: "Final Project Information",
  teachingLearning: "Supervision & Learning",
  weeklyPlan: "Milestone Plan",
  policy: "Project Policies & Responsibilities",
  pageDescription:
    "Define the supervised project framework, milestones, assessment, and OBE alignment.",
  weekSingular: "Project Week",
  weekPlural: "Project Weeks",
  topic: "Milestone / Focus",
  learningOutcomes: "Expected Learning / Achievement",
  teachingMethods: "Supervision / Learning Method",
  learningActivities: "Student Project Activities",
  assessment: "Review / Evidence",
  resources: "Project Resources",
  detailedPlan: "Final Project Milestone Plan",
};

export function courseSpecTerminologyForCode(code: string): CourseSpecTerminology {
  return isFinalProjectCourseCode(code)
    ? FINAL_PROJECT_TERMINOLOGY
    : TAUGHT_COURSE_TERMINOLOGY;
}
