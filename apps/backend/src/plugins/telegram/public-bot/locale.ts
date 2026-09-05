import type { TelegramReplyMarkup } from "./telegram-client.ts";

export type TelegramLocale = "en" | "km";

export const LANGUAGE_BUTTONS = {
  en: "🇬🇧 English",
  km: "🇰🇭 ភាសាខ្មែរ",
} as const;

export const LANGUAGE_SWITCH_LABELS = {
  en: "🌐 Language",
  km: "🌐 ភាសា",
} as const;

const labelKm = new Map<string, string>([
  ["🚀 Explore DSE", "🚀 ស្វែងយល់អំពី DSE"],
  ["📝 Admission", "📝 ការចូលរៀន"],
  ["📚 Study & Curriculum", "📚 ការសិក្សា និងកម្មវិធីសិក្សា"],
  ["💼 Careers", "💼 អាជីព"],
  ["💰 Fees & Scholarships", "💰 ថ្លៃសិក្សា និងអាហារូបករណ៍"],
  ["❓ Ask DSE", "❓ សួរ DSE"],
  ["☰ More", "☰ ផ្សេងៗ"],
  ["1 · What is DSE?", "1 · DSE ជាអ្វី?"],
  ["2 · What will I study?", "2 · ខ្ញុំនឹងសិក្សាអ្វី?"],
  ["3 · What can I become?", "3 · ខ្ញុំអាចធ្វើការអ្វី?"],
  ["4 · Is DSE right for me?", "4 · តើ DSE សមស្របសម្រាប់ខ្ញុំទេ?"],
  ["5 · Ready to apply?", "5 · ត្រៀមដាក់ពាក្យហើយឬនៅ?"],
  ["About DSE", "អំពី DSE"],
  ["Next →", "បន្ទាប់ →"],
  ["Study & Curriculum", "ការសិក្សា និងកម្មវិធីសិក្សា"],
  ["Careers", "អាជីព"],
  ["Suitability guide", "មគ្គុទេសក៍ភាពសមស្រប"],
  ["Admission", "ការចូលរៀន"],
  ["How to apply", "របៀបដាក់ពាក្យ"],
  ["What is DSE?", "DSE ជាអ្វី?"],
  ["Why DSE?", "ហេតុអ្វីជ្រើស DSE?"],
  ["What will I learn?", "ខ្ញុំនឹងរៀនអ្វី?"],
  ["Duration", "រយៈពេលសិក្សា"],
  ["Who should join?", "អ្នកណាគួរចូលរៀន?"],
  ["DSE vs CS", "DSE និង CS"],
  ["DSE vs IT", "DSE និង IT"],
  ["Who can apply?", "អ្នកណាអាចដាក់ពាក្យ?"],
  ["Requirements", "លក្ខខណ្ឌ"],
  ["Documents", "ឯកសារ"],
  ["Entrance exam", "ប្រឡងចូល"],
  ["English", "ភាសាអង់គ្លេស"],
  ["Programming", "ការសរសេរកម្មវិធី"],
  ["Mathematics", "គណិតវិទ្យា"],
  ["Application deadline", "ថ្ងៃផុតកំណត់ដាក់ពាក្យ"],
  ["Is DSE right for me?", "តើ DSE សមស្របសម្រាប់ខ្ញុំទេ?"],
  ["Data & numbers", "ទិន្នន័យ និងលេខ"],
  ["AI & technology", "AI និងបច្ចេកវិទ្យា"],
  ["Research", "ស្រាវជ្រាវ"],
  ["Not sure", "មិនប្រាកដ"],
  ["Overview", "ទិដ្ឋភាពទូទៅ"],
  ["Year 1", "ឆ្នាំទី 1"],
  ["Year 2", "ឆ្នាំទី 2"],
  ["Year 3", "ឆ្នាំទី 3"],
  ["Year 4", "ឆ្នាំទី 4"],
  ["Data", "ទិន្នន័យ"],
  ["AI & ML", "AI និង ML"],
  ["Math & Statistics", "គណិតវិទ្យា និងស្ថិតិ"],
  ["Projects", "គម្រោង"],
  ["Internship", "កម្មសិក្សា"],
  ["Final-year project", "គម្រោងឆ្នាំចុងក្រោយ"],
  ["All courses", "មុខវិជ្ជាទាំងអស់"],
  ["Jobs overview", "ទិដ្ឋភាពអាជីព"],
  ["Career explorer", "ស្វែងរកអាជីព"],
  ["Data Analyst", "អ្នកវិភាគទិន្នន័យ"],
  ["Data Scientist", "អ្នកវិទ្យាសាស្ត្រទិន្នន័យ"],
  ["ML Engineer", "វិស្វករ ML"],
  ["Data Engineer", "វិស្វករទិន្នន័យ"],
  ["Software Engineer", "វិស្វករសូហ្វវែរ"],
  ["BI Analyst", "អ្នកវិភាគ BI"],
  ["Government", "រដ្ឋាភិបាល"],
  ["Agriculture & Technology", "កសិកម្ម និងបច្ចេកវិទ្យា"],
  ["Tuition", "ថ្លៃសិក្សា"],
  ["Other study costs", "ចំណាយសិក្សាផ្សេងៗ"],
  ["Scholarships", "អាហារូបករណ៍"],
  ["Payment schedule", "កាលវិភាគបង់ថ្លៃ"],
  ["Financial support", "ជំនួយហិរញ្ញវត្ថុ"],
  ["Available scholarships", "អាហារូបករណ៍ដែលមាន"],
  ["Eligibility", "លក្ខខណ្ឌទទួលបាន"],
  ["Deadline", "ថ្ងៃផុតកំណត់"],
  ["🎓 About DSE", "🎓 អំពី DSE"],
  ["🏫 Student Life", "🏫 ជីវិតនិស្សិត"],
  ["🧪 Labs & Facilities", "🧪 មន្ទីរពិសោធន៍ និងបរិក្ខារ"],
  ["👩‍🏫 Lecturers", "👩‍🏫 សាស្ត្រាចារ្យ"],
  ["📅 Important Dates", "📅 កាលបរិច្ឆេទសំខាន់ៗ"],
  ["📍 Contact Us", "📍 ទាក់ទងយើង"],
  ["Studying DSE", "ការសិក្សា DSE"],
  ["Internships", "កម្មសិក្សា"],
  ["Clubs", "ក្លឹប"],
  ["Competitions", "ការប្រកួត"],
  ["Study workload", "បន្ទុកការសិក្សា"],
  ["Team projects", "គម្រោងក្រុម"],
  ["Student support", "ការគាំទ្រនិស្សិត"],
  ["Computer labs", "មន្ទីរកុំព្យូទ័រ"],
  ["Data Computing Lab", "មន្ទីរគណនាទិន្នន័យ"],
  ["Smart Agriculture Systems Lab", "មន្ទីរប្រព័ន្ធកសិកម្មឆ្លាតវៃ"],
  ["Software & tools", "សូហ្វវែរ និងឧបករណ៍"],
  ["Research facilities", "បរិក្ខារស្រាវជ្រាវ"],
  ["Programme leadership", "ថ្នាក់ដឹកនាំកម្មវិធី"],
  ["All lecturers", "សាស្ត្រាចារ្យទាំងអស់"],
  ["Expertise", "ជំនាញ"],
  ["Application opens", "ថ្ងៃបើកទទួលពាក្យ"],
  ["Interview", "សម្ភាសន៍"],
  ["Results", "លទ្ធផល"],
  ["Registration", "ចុះឈ្មោះ"],
  ["Semester start", "ចាប់ផ្តើមឆមាស"],
  ["Location", "ទីតាំង"],
  ["Phone", "ទូរស័ព្ទ"],
  ["Email", "អ៊ីមែល"],
  ["Website", "គេហទំព័រ"],
  ["Admissions contact", "ទំនាក់ទំនងការចូលរៀន"],
  ["Popular questions", "សំណួរពេញនិយម"],
  ["Curriculum", "កម្មវិធីសិក្សា"],
  ["Fees", "ថ្លៃសិក្សា"],
  ["← Back", "← ត្រឡប់ក្រោយ"],
  ["🏠 Home", "🏠 ទំព័រដើម"],
]);

const replyKmToEn = new Map<string, string>(
  [...labelKm.entries()].map(([en, km]) => [km, en]),
);

export function localeFromSelection(text: string): TelegramLocale | null {
  if (text === LANGUAGE_BUTTONS.en) return "en";
  if (text === LANGUAGE_BUTTONS.km) return "km";
  return null;
}

export function isLanguageSwitch(text: string): boolean {
  return text === "/language" || text === LANGUAGE_SWITCH_LABELS.en || text === LANGUAGE_SWITCH_LABELS.km;
}

export function toEnglishReplyText(text: string): string {
  return replyKmToEn.get(text) ?? text;
}

export function localizeLabel(text: string, locale: TelegramLocale): string {
  return locale === "km" ? (labelKm.get(text) ?? text) : text;
}

export function languageSelectorMarkup(): TelegramReplyMarkup {
  return {
    keyboard: [[{ text: LANGUAGE_BUTTONS.km }, { text: LANGUAGE_BUTTONS.en }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function localizeReplyMarkup(
  markup: TelegramReplyMarkup | undefined,
  locale: TelegramLocale,
): TelegramReplyMarkup | undefined {
  if (!markup) return undefined;
  if ("keyboard" in markup) {
    const rows = markup.keyboard.map((row) =>
      row.map((button) => ({ text: localizeLabel(button.text, locale) })),
    );
    rows.push([{ text: LANGUAGE_SWITCH_LABELS[locale] }]);
    return { keyboard: rows, resize_keyboard: true, is_persistent: true };
  }
  return {
    inline_keyboard: markup.inline_keyboard.map((row) =>
      row.map((button) => ({ ...button, text: localizeLabel(button.text, locale) })),
    ),
  };
}

function localizeHeading(line: string): string {
  const headings = new Map<string, string>([
    ["About DSE", "អំពី DSE"],
    ["Admission", "ការចូលរៀន"],
    ["Study & Curriculum", "ការសិក្សា និងកម្មវិធីសិក្សា"],
    ["Careers", "អាជីព"],
    ["Fees & Scholarships", "ថ្លៃសិក្សា និងអាហារូបករណ៍"],
    ["Scholarships", "អាហារូបករណ៍"],
    ["Student Life", "ជីវិតនិស្សិត"],
    ["Labs & Facilities", "មន្ទីរពិសោធន៍ និងបរិក្ខារ"],
    ["Lecturers", "សាស្ត្រាចារ្យ"],
    ["Important Dates", "កាលបរិច្ឆេទសំខាន់ៗ"],
    ["Contact Us", "ទាក់ទងយើង"],
    ["Ask DSE", "សួរ DSE"],
    ["DSE Information", "ព័ត៌មាន DSE"],
    ["Ask DSE · Popular Questions", "សួរ DSE · សំណួរពេញនិយម"],
    ["Ask DSE · Possible matches", "សួរ DSE · សំណួរដែលអាចត្រូវ"],
    ["Courses · Published Curriculum", "មុខវិជ្ជា · កម្មវិធីសិក្សាដែលបានផ្សព្វផ្សាយ"],
    ["Programme Study Load", "បន្ទុកសិក្សាកម្មវិធី"],
    ["DSE Curriculum", "កម្មវិធីសិក្សា DSE"],
    ["DSE Lecturers", "សាស្ត្រាចារ្យ DSE"],
    ["Popular Questions", "សំណួរពេញនិយម"],
  ]);
  return headings.get(line) ?? line;
}

export function localizeBotText(text: string, locale: TelegramLocale): string {
  if (locale === "en") return text;
  if (text.startsWith("Welcome to the DSE Program Information Bot")) {
    return "សូមស្វាគមន៍មកកាន់បូតព័ត៌មានកម្មវិធី DSE 👋\n\nសូមជ្រើសប្រធានបទខាងក្រោម វាយ /courses ដើម្បីមើលមុខវិជ្ជា ឬសួរសំណួរអំពី DSE ដោយផ្ទាល់។";
  }
  if (text.startsWith("Welcome to DSE 👋")) {
    return text.replace(
      "Welcome to DSE 👋\n\nLearn about Data Science and Engineering or ask about the programme.",
      "សូមស្វាគមន៍មកកាន់ DSE 👋\n\nស្វែងយល់អំពី Data Science and Engineering ឬសួរអំពីកម្មវិធីសិក្សា។",
    );
  }

  const lines = text.split("\n");
  const localized = lines.map((line, index) => {
    if (index === 0) return localizeHeading(line);
    return line
      .replace(/^Apply: /, "ដាក់ពាក្យ: ")
      .replace(/^Email: /, "អ៊ីមែល: ")
      .replace(/^Phone: /, "ទូរស័ព្ទ: ")
      .replace(/^Location: /, "ទីតាំង: ")
      .replace(/^Website: /, "គេហទំព័រ: ")
      .replace(/^Facebook: /, "Facebook: ")
      .replace(/^Credits: /, "ក្រេឌីត: ")
      .replace(/^Weekly hours: /, "ម៉ោងក្នុងមួយសប្ដាហ៍: ")
      .replace(/^Lecturer\(s\): /, "សាស្ត្រាចារ្យ: ")
      .replace(/^Source: approved curriculum v/, "ប្រភព: កម្មវិធីសិក្សាអនុម័ត v")
      .replace(/^Year (\d+), Semester 1$/, "ឆ្នាំទី $1, ឆមាសទី 1")
      .replace(/^Year (\d+), Semester 2$/, "ឆ្នាំទី $1, ឆមាសទី 2")
      .replace(/^Year (\d+) · Semester 1$/, "ឆ្នាំទី $1 · ឆមាសទី 1")
      .replace(/^Year (\d+) · Semester 2$/, "ឆ្នាំទី $1 · ឆមាសទី 2");
  }).join("\n");

  return localized
    .replace("No published information is available yet.", "មិនទាន់មានព័ត៌មានដែលបានផ្សព្វផ្សាយទេ។")
    .replace("No official published dates are available yet.", "មិនទាន់មានកាលបរិច្ឆេទផ្លូវការដែលបានផ្សព្វផ្សាយទេ។")
    .replace("No published contact information is available yet.", "មិនទាន់មានព័ត៌មានទំនាក់ទំនងដែលបានផ្សព្វផ្សាយទេ។")
    .replace("No published curriculum courses are available yet.", "មិនទាន់មានមុខវិជ្ជាពីកម្មវិធីសិក្សាដែលបានផ្សព្វផ្សាយទេ។")
    .replace("Choose an option below.", "សូមជ្រើសរើសជម្រើសខាងក្រោម។")
    .replace("Type one of these questions directly, or choose a topic below.", "សូមវាយសំណួរមួយក្នុងចំណោមសំណួរទាំងនេះដោយផ្ទាល់ ឬជ្រើសប្រធានបទខាងក្រោម។")
    .replace("You can also type a question directly.", "អ្នកក៏អាចវាយសំណួរដោយផ្ទាល់បានផងដែរ។")
    .replace("Please ask one of these more specifically.", "សូមសួរមួយក្នុងចំណោមសំណួរទាំងនេះឱ្យជាក់លាក់ជាងមុន។")
    .replace("I couldn't find a confirmed answer in the published DSE information. Try a more specific question, /courses, or choose a topic from the menu.", "ខ្ញុំរកមិនឃើញចម្លើយដែលបានបញ្ជាក់ក្នុងព័ត៌មាន DSE ដែលបានផ្សព្វផ្សាយទេ។ សូមសួរឱ្យជាក់លាក់ជាងមុន វាយ /courses ឬជ្រើសប្រធានបទពីម៉ឺនុយ។")
    .replace("This action is unavailable.", "សកម្មភាពនេះមិនអាចប្រើបានទេ។");
}
