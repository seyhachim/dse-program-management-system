export type StudentOpportunity = {
  slug: string;
  title: string;
  organizer: string;
  category: "Hackathon" | "Competition" | "Fellowship" | "Scholarship" | "Internship";
  summary: string;
  themes: string[];
  eligibility: string;
  format: string;
  deadline?: string;
  eventDates: string;
  teamSize?: string;
  difficulty: "Beginner friendly" | "Intermediate" | "Intermediate / advanced";
  dseFit: 1 | 2 | 3 | 4 | 5;
  facultyNote: string;
  officialUrl: string;
  featured?: boolean;
};

/**
 * Verified student-facing opportunities.
 *
 * Keep this list intentionally small: only opportunities that have been checked
 * against an official organiser/event page should be published here. The Life
 * Dashboard remains the capture/inbox layer for unverified discoveries.
 */
export const studentOpportunities: StudentOpportunity[] = [
  {
    slug: "nasa-space-apps-2026",
    title: "NASA Space Apps Challenge 2026",
    organizer: "NASA International Space Apps Challenge",
    category: "Hackathon",
    summary:
      "A global hackathon using NASA and partner open data to solve real-world challenges. Strong fit for AI, data science, climate, Earth observation, agriculture, water and environmental projects.",
    themes: ["AI", "Data Science", "Climate", "Earth Observation", "Agriculture"],
    eligibility: "Global; all ages and skill levels. Local event rules may vary.",
    format: "Global / local events + online Universal Event",
    eventDates: "14–15 November 2026",
    difficulty: "Beginner friendly",
    dseFit: 5,
    facultyNote:
      "Top recommendation for DSE students. Consider teams around flood/drought analysis, smart agriculture, satellite imagery or environmental monitoring.",
    officialUrl: "https://www.spaceappschallenge.org/",
    featured: true,
  },
  {
    slug: "gatewayhacks-2026",
    title: "GatewayHacks 2026",
    organizer: "GatewayHacks",
    category: "Hackathon",
    summary:
      "A fully virtual student hackathon with tracks in accessibility and health, equity in education, environmental sustainability, and community impact. Software, hardware, AI and no-code prototypes are accepted.",
    themes: ["AI", "Software", "Sustainability", "Education", "Social Impact"],
    eligibility: "Worldwide student event; ages 13+.",
    format: "Global / virtual",
    deadline: "1 October 2026",
    eventDates: "Submission window closes 1 October 2026",
    teamSize: "1–4 students",
    difficulty: "Beginner friendly",
    dseFit: 5,
    facultyNote:
      "Strong DSE fit for AI/software, education technology, sustainability and social-impact projects.",
    officialUrl: "https://gatewayhacks-2026.devpost.com/",
    featured: true,
  },
  {
    slug: "ethonline-2026",
    title: "ETHOnline 2026",
    organizer: "ETHGlobal",
    category: "Hackathon",
    summary:
      "An asynchronous online Ethereum/Web3 hackathon for builders. Best suited to students who already have solid software-development skills and want to explore blockchain or Web3 tooling.",
    themes: ["Software Development", "Web3", "Blockchain", "AI Agents"],
    eligibility: "Global; individual sponsor tracks have their own qualification requirements.",
    format: "Global / online",
    eventDates: "4–16 September 2026",
    difficulty: "Intermediate / advanced",
    dseFit: 4,
    facultyNote:
      "Recommend mainly to stronger programmers who can start immediately and are comfortable learning new developer tooling quickly.",
    officialUrl: "https://ethglobal.com/events/ethonline2026",
  },
];
