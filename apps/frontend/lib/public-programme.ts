export type PublicProgrammeSource = "curated-fallback" | "approved-pms";

export type PublicProgrammeCourse = {
  code: string;
  title: string;
};

export type PublicProgrammeContent = {
  source: PublicProgrammeSource;
  hero: {
    eyebrow: string;
    title: string;
    tagline: string;
    description: string;
  };
  snapshot: ReadonlyArray<{ value: string; label: string }>;
  learningThemes: ReadonlyArray<{
    title: string;
    description: string;
    icon: "chart" | "code" | "brain" | "database" | "idea" | "people";
  }>;
  journey: ReadonlyArray<{ year: string; label: string }>;
  curriculumPreview: {
    heading: string;
    note: string;
    semesters: ReadonlyArray<{
      title: string;
      courses: ReadonlyArray<PublicProgrammeCourse>;
    }>;
  };
  practice: ReadonlyArray<{
    title: string;
    description: string;
    icon: "project" | "lab" | "practicum" | "internship" | "capstone";
  }>;
  careers: ReadonlyArray<string>;
  stories: ReadonlyArray<{
    title: string;
    description: string;
    category: string;
  }>;
};

/**
 * Public-only presentation content for the DSE programme homepage.
 *
 * This is intentionally a narrow DTO rather than a Prisma model or an internal
 * API response. The canonical curriculum publication flow will replace the
 * curated academic fallback with an Approved/Active projection. Draft/review
 * data, student records, QA/SAR data, internal ids, permissions, and private
 * staff fields must never be added to this contract.
 */
export const publicProgrammeContent: PublicProgrammeContent = {
  source: "curated-fallback",
  hero: {
    eyebrow: "Faculty of Engineering · RUPP",
    title: "Data Science & Engineering",
    tagline: "From data to real-world impact.",
    description:
      "An engineering programme combining data science, computing, AI, mathematics and professional practice to solve real-world problems responsibly.",
  },
  snapshot: [
    { value: "4 Years", label: "Programme duration" },
    { value: "8 Semesters", label: "Academic structure" },
    { value: "143 Credits", label: "Curriculum snapshot" },
    { value: "B.Eng.", label: "Bachelor of Engineering" },
  ],
  learningThemes: [
    {
      title: "Data & Statistics",
      description: "Build foundations in statistics, predictive analytics, time series and data-driven decision making.",
      icon: "chart",
    },
    {
      title: "Computing & Software",
      description: "Progress from C++ and Python to algorithms, web engineering, mobile applications and software systems.",
      icon: "code",
    },
    {
      title: "AI & Machine Learning",
      description: "Study applied machine learning, deep learning, natural language processing and large language models.",
      icon: "brain",
    },
    {
      title: "Data Engineering",
      description: "Work with SQL, NoSQL, data warehousing, big-data processing, cloud technologies and data pipelines.",
      icon: "database",
    },
    {
      title: "Applied & Emerging Domains",
      description: "Apply data and AI in smart agriculture, IoT, business intelligence, finance and supply-chain contexts.",
      icon: "idea",
    },
    {
      title: "Professional & Ethical Practice",
      description: "Develop communication, teamwork, leadership, entrepreneurship and responsible data-science practice.",
      icon: "people",
    },
  ],
  journey: [
    { year: "Year 1", label: "Foundations in programming, mathematics, statistics and communication" },
    { year: "Year 2", label: "Core algorithms, databases, analytics and web engineering" },
    { year: "Year 3", label: "Applied AI, big data, apps, IoT, smart agriculture and machine-learning practicums" },
    { year: "Year 4", label: "Advanced study, final project and a coursework, thesis or industrial pathway" },
  ],
  curriculumPreview: {
    heading: "Curriculum preview",
    note: "Curated fallback based on the 2026 DSE curriculum. The public page prefers the currently approved, active PMS curriculum whenever it is available.",
    semesters: [
      {
        title: "Year 1 · Semester 1",
        courses: [
          { code: "ENG101", title: "English I: Academic Reading for Data Science" },
          { code: "IDS101", title: "Introduction to Data Science and Engineering" },
          { code: "BPR101", title: "Basic Programming (C++)" },
          { code: "DLP101", title: "Digital Literacy" },
          { code: "CCS101", title: "Climate Change and Sustainable Development" },
          { code: "KHI101", title: "Khmer History" },
        ],
      },
      {
        title: "Year 1 · Semester 2",
        courses: [
          { code: "ENG102", title: "English II: Communication and Academic Writing for Data Science" },
          { code: "MAT102", title: "Math I: Calculus" },
          { code: "APR102", title: "Advanced Programming (Python)" },
          { code: "STA102", title: "Statistics I: Probability and Descriptive Statistics" },
          { code: "PDT102", title: "Personal Development and Teamwork" },
          { code: "KCI102", title: "Khmer Civilization" },
        ],
      },
    ],
  },
  practice: [
    {
      title: "Projects",
      description: "Build working solutions across web engineering, analytics, machine learning and final-year study.",
      icon: "project",
    },
    {
      title: "Labs",
      description: "Use programming, database, visualisation, AI and engineering tools through practical course work.",
      icon: "lab",
    },
    {
      title: "Practicums",
      description: "Develop progressively through web-engineering and applied machine-learning practicum courses.",
      icon: "practicum",
    },
    {
      title: "Industrial Pathway",
      description: "Year 4 includes an industrial internship option alongside coursework and research pathways.",
      icon: "internship",
    },
    {
      title: "Final Project",
      description: "Complete advanced final-year work through the programme's project and pathway structure.",
      icon: "capstone",
    },
  ],
  careers: [
    "Data Scientist",
    "Data Analyst / BI Analyst",
    "Data Engineer",
    "Machine Learning / AI Engineer",
    "Software or Data Application Developer",
    "Research / Graduate Study",
  ],
  stories: [
    {
      title: "Student Project Showcase",
      description: "A future home for approved student work and applied DSE projects.",
      category: "Projects",
    },
    {
      title: "Competition & Events",
      description: "Programme activities, competitions and events once public publishing is available.",
      category: "Community",
    },
    {
      title: "Industry Collaboration",
      description: "Approved partnerships and industry-facing programme activity.",
      category: "Industry",
    },
  ],
};
