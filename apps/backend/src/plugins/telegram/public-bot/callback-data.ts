import type {
  CallbackData,
  LecturerCallbackData,
  RouteKey,
  StaticCallbackData,
} from "./menu-types.ts";

export const TELEGRAM_CALLBACK_MAX_BYTES = 64;

export const ROUTE_CALLBACKS = {
  home: "nav:home",
  explore: "explore:start",
  "explore.step1": "explore:step:1",
  "explore.step2": "explore:step:2",
  "explore.step3": "explore:step:3",
  "explore.step4": "explore:step:4",
  "explore.step5": "explore:step:5",
  about: "about:menu",
  admission: "admission:menu",
  fit: "fit:start",
  curriculum: "curriculum:menu",
  careers: "careers:menu",
  fees: "fees:menu",
  scholarships: "scholarships:menu",
  more: "nav:more",
  studentLife: "studentlife:menu",
  facilities: "facility:menu",
  lecturers: "lecturers:menu",
  dates: "dates:menu",
  contact: "contact:menu",
  ask: "ask:start",
} satisfies Record<RouteKey, StaticCallbackData>;

const STATIC_CALLBACKS = new Set<StaticCallbackData>([
  ...Object.values(ROUTE_CALLBACKS),
  "about:what_is_dse",
  "about:why_dse",
  "about:what_learn",
  "about:duration",
  "about:who_should_join",
  "about:vs_cs",
  "about:vs_it",
  "admission:eligibility",
  "admission:requirements",
  "admission:how_to_apply",
  "admission:documents",
  "admission:exam",
  "admission:english",
  "admission:programming",
  "admission:math",
  "fit:q1:programming",
  "fit:q1:data",
  "fit:q1:ai",
  "fit:q1:research",
  "fit:q1:unsure",
  "fit:q2:love",
  "fit:q2:okay",
  "fit:q2:difficult",
  "fit:q3:yes",
  "fit:q3:little",
  "fit:q3:never",
  "curriculum:overview",
  "curriculum:year:1",
  "curriculum:year:2",
  "curriculum:year:3",
  "curriculum:year:4",
  "curriculum:topic:programming",
  "curriculum:topic:data",
  "curriculum:topic:ai_ml",
  "curriculum:topic:math",
  "curriculum:projects",
  "curriculum:internship",
  "curriculum:final_project",
  "curriculum:courses:page:1",
  "careers:jobs",
  "careers:explorer",
  "career:data_analyst",
  "career:data_scientist",
  "career:ml_engineer",
  "career:data_engineer",
  "career:software_engineer",
  "career:bi_analyst",
  "career:research",
  "career:government",
  "career:agritech",
  "fees:tuition",
  "fees:other_costs",
  "fees:payment_schedule",
  "fees:support",
  "scholarships:available",
  "scholarships:eligibility",
  "scholarships:apply",
  "scholarships:deadline",
  "studentlife:experience",
  "studentlife:projects",
  "studentlife:internships",
  "studentlife:clubs",
  "studentlife:competitions",
  "studentlife:workload",
  "studentlife:team_projects",
  "studentlife:support",
  "facility:computer_labs",
  "facility:data_computing",
  "facility:smart_agriculture",
  "facility:software",
  "facility:research",
  "lecturers:leadership",
  "lecturers:list:1",
  "lecturers:expertise",
  "lecturers:research",
  "dates:application_open",
  "dates:application_deadline",
  "dates:exam",
  "dates:interview",
  "dates:results",
  "dates:registration",
  "dates:semester_start",
  "contact:location",
  "contact:phone",
  "contact:email",
  "contact:website",
  "contact:admissions",
  "faq:popular",
  "faq:category:admission",
  "faq:category:curriculum",
  "faq:category:careers",
  "faq:category:fees",
]);

const COURSE_CODE = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const LECTURER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;

export type ParsedCallback =
  | { kind: "static"; data: StaticCallbackData }
  | { kind: "course"; code: string; data: `course:${string}` }
  | { kind: "lecturer"; slug: string; action: "courses" | "research"; data: LecturerCallbackData };

export function callbackByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertCallbackWithinTelegramLimit<T extends string>(value: T): T {
  if (callbackByteLength(value) > TELEGRAM_CALLBACK_MAX_BYTES) {
    throw new Error(`Telegram callback_data must be <= ${TELEGRAM_CALLBACK_MAX_BYTES} bytes`);
  }
  return value;
}

export function buildCourseCallback(code: string): `course:${string}` {
  const normalized = code.trim().toUpperCase();
  if (!COURSE_CODE.test(normalized)) {
    throw new Error("Invalid course callback code");
  }
  return assertCallbackWithinTelegramLimit(`course:${normalized}` as const);
}

export function buildLecturerCallback(
  slug: string,
  action: "courses" | "research",
): LecturerCallbackData {
  const normalized = slug.trim().toLowerCase();
  if (!LECTURER_SLUG.test(normalized)) {
    throw new Error("Invalid lecturer callback slug");
  }
  return assertCallbackWithinTelegramLimit(`lecturer:${normalized}:${action}` as LecturerCallbackData);
}

export function parseCallbackData(value: string): ParsedCallback | null {
  if (!value || callbackByteLength(value) > TELEGRAM_CALLBACK_MAX_BYTES) return null;

  if (STATIC_CALLBACKS.has(value as StaticCallbackData)) {
    return { kind: "static", data: value as StaticCallbackData };
  }

  if (value.startsWith("course:")) {
    const code = value.slice("course:".length);
    if (!COURSE_CODE.test(code)) return null;
    return { kind: "course", code, data: value as `course:${string}` };
  }

  if (value.startsWith("lecturer:")) {
    const [, slug, action, ...rest] = value.split(":");
    if (rest.length || !slug || !action || !LECTURER_SLUG.test(slug)) return null;
    if (action !== "courses" && action !== "research") return null;
    return { kind: "lecturer", slug, action, data: value as LecturerCallbackData };
  }

  return null;
}

export function isCallbackData(value: string): value is CallbackData {
  return parseCallbackData(value) !== null;
}
