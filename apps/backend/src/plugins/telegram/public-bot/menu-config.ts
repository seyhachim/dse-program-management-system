import { ROUTE_CALLBACKS, assertCallbackWithinTelegramLimit } from "./callback-data.ts";
import type {
  CallbackButton,
  CallbackData,
  InlineButton,
  ReplyButton,
  RouteKey,
  TelegramMenu,
} from "./menu-types.ts";

function cb(text: string, callbackData: CallbackData): CallbackButton {
  return {
    type: "callback",
    text,
    callbackData: assertCallbackWithinTelegramLimit(callbackData),
  };
}

export const MAIN_REPLY_KEYBOARD = [
  [
    { text: "🏠 Home", route: "home" },
    { text: "❓ Ask DSE", route: "ask" },
  ],
] as const satisfies ReadonlyArray<ReadonlyArray<ReplyButton>>;

const LEGACY_REPLY_TEXT_TO_ROUTE: Readonly<Record<string, RouteKey>> = {
  "🚀 Explore DSE": "explore",
  "📝 Admission": "admission",
  "📚 Study & Curriculum": "curriculum",
  "💼 Careers": "careers",
  "💰 Fees & Scholarships": "fees",
  "☰ More": "more",
};

export const REPLY_TEXT_TO_ROUTE: Readonly<Record<string, RouteKey>> = {
  ...LEGACY_REPLY_TEXT_TO_ROUTE,
  ...Object.fromEntries(
    MAIN_REPLY_KEYBOARD.flatMap((row) =>
      row.map((button) => [button.text, button.route]),
    ),
  ),
};

export const MENUS = {
  home: {
    route: "home",
    title: "DSE",
    rows: [
      [cb("🚀 Explore DSE", "explore:start"), cb("📝 Admission", "admission:menu")],
      [cb("📚 Study & Curriculum", "curriculum:menu"), cb("💼 Careers", "careers:menu")],
      [cb("💰 Fees & Scholarships", "fees:menu"), cb("❓ Ask DSE", "ask:start")],
      [cb("☰ More", "nav:more")],
    ],
    navigation: { showBack: false, showHome: false },
  },
  explore: {
    route: "explore",
    parent: "home",
    title: "Explore DSE",
    rows: [
      [cb("1 · What is DSE?", "about:what_is_dse")],
      [cb("2 · What will I study?", "curriculum:overview")],
      [cb("3 · What can I become?", "careers:jobs")],
      [cb("4 · Is DSE right for me?", "fit:start")],
      [cb("5 · Ready to apply?", "admission:how_to_apply")],
    ],
  },
  "explore.step1": {
    route: "explore.step1",
    parent: "explore",
    title: "Explore DSE · Step 1",
    rows: [[cb("About DSE", "about:menu"), cb("Next →", "explore:step:2")]],
  },
  "explore.step2": {
    route: "explore.step2",
    parent: "explore.step1",
    title: "Explore DSE · Step 2",
    rows: [[cb("Study & Curriculum", "curriculum:menu"), cb("Next →", "explore:step:3")]],
  },
  "explore.step3": {
    route: "explore.step3",
    parent: "explore.step2",
    title: "Explore DSE · Step 3",
    rows: [[cb("Careers", "careers:menu"), cb("Next →", "explore:step:4")]],
  },
  "explore.step4": {
    route: "explore.step4",
    parent: "explore.step3",
    title: "Explore DSE · Step 4",
    rows: [[cb("Suitability guide", "fit:start"), cb("Next →", "explore:step:5")]],
  },
  "explore.step5": {
    route: "explore.step5",
    parent: "explore.step4",
    title: "Explore DSE · Step 5",
    rows: [[cb("Admission", "admission:menu"), cb("How to apply", "admission:how_to_apply")]],
  },
  about: {
    route: "about",
    parent: "more",
    title: "About DSE",
    rows: [
      [cb("What is DSE?", "about:what_is_dse"), cb("Why DSE?", "about:why_dse")],
      [cb("What will I learn?", "about:what_learn"), cb("Duration", "about:duration")],
      [cb("Who should join?", "about:who_should_join")],
      [cb("DSE vs CS", "about:vs_cs"), cb("DSE vs IT", "about:vs_it")],
    ],
  },
  admission: {
    route: "admission",
    parent: "home",
    title: "Admission",
    rows: [
      [cb("Who can apply?", "admission:eligibility"), cb("Requirements", "admission:requirements")],
      [cb("How to apply", "admission:how_to_apply"), cb("Documents", "admission:documents")],
      [cb("Entrance exam", "admission:exam"), cb("English", "admission:english")],
      [cb("Programming", "admission:programming"), cb("Mathematics", "admission:math")],
      [cb("Application deadline", "dates:application_deadline")],
      [cb("Is DSE right for me?", "fit:start")],
    ],
  },
  fit: {
    route: "fit",
    parent: "admission",
    title: "DSE suitability guide",
    rows: [
      [cb("Programming", "fit:q1:programming"), cb("Data & numbers", "fit:q1:data")],
      [cb("AI & technology", "fit:q1:ai"), cb("Research", "fit:q1:research")],
      [cb("Not sure", "fit:q1:unsure")],
    ],
  },
  curriculum: {
    route: "curriculum",
    parent: "home",
    title: "Study & Curriculum",
    rows: [
      [cb("Overview", "curriculum:overview")],
      [cb("Year 1", "curriculum:year:1"), cb("Year 2", "curriculum:year:2")],
      [cb("Year 3", "curriculum:year:3"), cb("Year 4", "curriculum:year:4")],
      [cb("Projects", "curriculum:projects"), cb("Internship", "curriculum:internship")],
      [cb("All courses", "curriculum:courses:page:1")],
    ],
  },
  careers: {
    route: "careers",
    parent: "home",
    title: "Careers",
    rows: [
      [cb("Jobs overview", "careers:jobs"), cb("Career explorer", "careers:explorer")],
      [cb("Data Analyst", "career:data_analyst"), cb("Data Scientist", "career:data_scientist")],
      [cb("ML Engineer", "career:ml_engineer"), cb("Data Engineer", "career:data_engineer")],
      [cb("Research", "career:research"), cb("Government", "career:government")],
      [cb("Agriculture & Technology", "career:agritech")],
    ],
  },
  fees: {
    route: "fees",
    parent: "home",
    title: "Fees & Scholarships",
    rows: [
      [cb("Tuition", "fees:tuition"), cb("Other study costs", "fees:other_costs")],
      [cb("Scholarships", "scholarships:menu")],
      [cb("Payment schedule", "fees:payment_schedule"), cb("Financial support", "fees:support")],
    ],
  },
  scholarships: {
    route: "scholarships",
    parent: "fees",
    title: "Scholarships",
    rows: [
      [cb("Available scholarships", "scholarships:available")],
      [cb("Eligibility", "scholarships:eligibility"), cb("How to apply", "scholarships:apply")],
      [cb("Deadline", "scholarships:deadline")],
    ],
  },
  more: {
    route: "more",
    parent: "home",
    title: "More",
    rows: [
      [cb("🎓 About DSE", "about:menu"), cb("📅 Important Dates", "dates:menu")],
      [cb("📍 Contact Us", "contact:menu")],
    ],
  },
  studentLife: {
    route: "studentLife",
    parent: "more",
    title: "Student Life",
    rows: [
      [cb("Studying DSE", "studentlife:experience"), cb("Projects", "studentlife:projects")],
      [cb("Internships", "studentlife:internships"), cb("Clubs", "studentlife:clubs")],
      [cb("Competitions", "studentlife:competitions"), cb("Study workload", "studentlife:workload")],
      [cb("Team projects", "studentlife:team_projects"), cb("Student support", "studentlife:support")],
    ],
  },
  facilities: {
    route: "facilities",
    parent: "more",
    title: "Labs & Facilities",
    rows: [
      [cb("Computer labs", "facility:computer_labs")],
      [cb("Data Computing Lab", "facility:data_computing")],
      [cb("Smart Agriculture Systems Lab", "facility:smart_agriculture")],
      [cb("Software & tools", "facility:software"), cb("Research facilities", "facility:research")],
    ],
  },
  lecturers: {
    route: "lecturers",
    parent: "more",
    title: "Lecturers",
    rows: [
      [cb("Programme leadership", "lecturers:leadership")],
      [cb("All lecturers", "lecturers:list:1")],
      [cb("Expertise", "lecturers:expertise"), cb("Research", "lecturers:research")],
    ],
  },
  dates: {
    route: "dates",
    parent: "more",
    title: "Important Dates",
    rows: [],
  },
  contact: {
    route: "contact",
    parent: "more",
    title: "Contact Us",
    rows: [],
  },
  ask: {
    route: "ask",
    parent: "home",
    title: "Ask DSE",
    rows: [
      [cb("Popular questions", "faq:popular")],
      [cb("Admission", "faq:category:admission"), cb("Curriculum", "faq:category:curriculum")],
      [cb("Careers", "faq:category:careers"), cb("Fees", "faq:category:fees")],
    ],
  },
} as const satisfies Record<RouteKey, TelegramMenu>;

export function buildNavigationRows(menu: TelegramMenu): InlineButton[][] {
  const showBack = menu.navigation?.showBack ?? Boolean(menu.parent);
  const showHome = menu.navigation?.showHome ?? menu.route !== "home";
  const row: InlineButton[] = [];

  if (showBack) {
    const backRoute = menu.navigation?.backRoute ?? menu.parent;
    if (backRoute) {
      row.push(
        cb(menu.navigation?.backLabel ?? "← Back", ROUTE_CALLBACKS[backRoute]),
      );
    }
  }

  if (showHome) {
    row.push(cb(menu.navigation?.homeLabel ?? "🏠 Home", ROUTE_CALLBACKS.home));
  }

  return row.length ? [row] : [];
}

export function getMenuKeyboard(route: RouteKey): InlineButton[][] {
  const menu: TelegramMenu = MENUS[route];
  return [...menu.rows.map((row) => [...row]), ...buildNavigationRows(menu)];
}

export function getParentRoute(route: RouteKey): RouteKey | null {
  const menu: TelegramMenu = MENUS[route];
  return menu.navigation?.backRoute ?? menu.parent ?? null;
}

export function routeForReplyText(text: string): RouteKey | null {
  return REPLY_TEXT_TO_ROUTE[text] ?? null;
}
