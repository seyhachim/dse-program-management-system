export type RouteKey =
  | "home"
  | "explore"
  | "explore.step1"
  | "explore.step2"
  | "explore.step3"
  | "explore.step4"
  | "explore.step5"
  | "about"
  | "admission"
  | "fit"
  | "curriculum"
  | "careers"
  | "fees"
  | "scholarships"
  | "more"
  | "studentLife"
  | "facilities"
  | "lecturers"
  | "dates"
  | "contact"
  | "ask";

export type StaticCallbackData =
  | "nav:home"
  | "nav:more"
  | "explore:start"
  | "explore:step:1"
  | "explore:step:2"
  | "explore:step:3"
  | "explore:step:4"
  | "explore:step:5"
  | "about:menu"
  | "about:what_is_dse"
  | "about:why_dse"
  | "about:what_learn"
  | "about:duration"
  | "about:who_should_join"
  | "about:vs_cs"
  | "about:vs_it"
  | "admission:menu"
  | "admission:eligibility"
  | "admission:requirements"
  | "admission:how_to_apply"
  | "admission:documents"
  | "admission:exam"
  | "admission:english"
  | "admission:programming"
  | "admission:math"
  | "fit:start"
  | "fit:q1:programming"
  | "fit:q1:data"
  | "fit:q1:ai"
  | "fit:q1:research"
  | "fit:q1:unsure"
  | "fit:q2:love"
  | "fit:q2:okay"
  | "fit:q2:difficult"
  | "fit:q3:yes"
  | "fit:q3:little"
  | "fit:q3:never"
  | "curriculum:menu"
  | "curriculum:overview"
  | "curriculum:year:1"
  | "curriculum:year:2"
  | "curriculum:year:3"
  | "curriculum:year:4"
  | "curriculum:topic:programming"
  | "curriculum:topic:data"
  | "curriculum:topic:ai_ml"
  | "curriculum:topic:math"
  | "curriculum:projects"
  | "curriculum:internship"
  | "curriculum:final_project"
  | "curriculum:courses:page:1"
  | "careers:menu"
  | "careers:jobs"
  | "careers:explorer"
  | "career:data_analyst"
  | "career:data_scientist"
  | "career:ml_engineer"
  | "career:data_engineer"
  | "career:software_engineer"
  | "career:bi_analyst"
  | "career:research"
  | "career:government"
  | "career:agritech"
  | "fees:menu"
  | "fees:tuition"
  | "fees:other_costs"
  | "fees:payment_schedule"
  | "fees:support"
  | "scholarships:menu"
  | "scholarships:available"
  | "scholarships:eligibility"
  | "scholarships:apply"
  | "scholarships:deadline"
  | "studentlife:menu"
  | "studentlife:experience"
  | "studentlife:projects"
  | "studentlife:internships"
  | "studentlife:clubs"
  | "studentlife:competitions"
  | "studentlife:workload"
  | "studentlife:team_projects"
  | "studentlife:support"
  | "facility:menu"
  | "facility:computer_labs"
  | "facility:data_computing"
  | "facility:smart_agriculture"
  | "facility:software"
  | "facility:research"
  | "lecturers:menu"
  | "lecturers:leadership"
  | "lecturers:list:1"
  | "lecturers:expertise"
  | "lecturers:research"
  | "dates:menu"
  | "dates:application_open"
  | "dates:application_deadline"
  | "dates:exam"
  | "dates:interview"
  | "dates:results"
  | "dates:registration"
  | "dates:semester_start"
  | "contact:menu"
  | "contact:location"
  | "contact:phone"
  | "contact:email"
  | "contact:website"
  | "contact:admissions"
  | "ask:start"
  | "faq:popular"
  | "faq:category:admission"
  | "faq:category:curriculum"
  | "faq:category:careers"
  | "faq:category:fees";

export type CourseCallbackData = `course:${string}`;
export type LecturerCallbackData = `lecturer:${string}:${"courses" | "research"}`;
export type CallbackData = StaticCallbackData | CourseCallbackData | LecturerCallbackData;

export interface CallbackButton {
  type: "callback";
  text: string;
  callbackData: CallbackData;
}

export interface UrlButton {
  type: "url";
  text: string;
  url: string;
}

export type InlineButton = CallbackButton | UrlButton;

export interface ReplyButton {
  text: string;
  route: RouteKey;
}

export interface TelegramMenu {
  route: RouteKey;
  parent?: RouteKey;
  title: string;
  rows: ReadonlyArray<ReadonlyArray<InlineButton>>;
  navigation?: {
    showBack?: boolean;
    showHome?: boolean;
    backLabel?: string;
    homeLabel?: string;
    backRoute?: RouteKey;
  };
}
