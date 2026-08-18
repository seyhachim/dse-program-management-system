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
      "A modern engineering programme combining data, computing, AI and engineering to solve real problems that matter.",
  },
  snapshot: [
    { value: "4 Years", label: "Programme duration" },
    { value: "8 Semesters", label: "Academic structure" },
    { value: "140 Credits", label: "Curriculum snapshot" },
    { value: "B.Eng.", label: "Bachelor of Engineering" },
  ],
  learningThemes: [
    {
      title: "Data & Statistics",
      description: "Collect, analyse and interpret data to generate meaningful insight.",
      icon: "chart",
    },
    {
      title: "Computing",
      description: "Build strong foundations in programming, algorithms and software systems.",
      icon: "code",
    },
    {
      title: "AI & Machine Learning",
      description: "Design intelligent models and apply AI to solve complex problems.",
      icon: "brain",
    },
    {
      title: "Data Engineering",
      description: "Design data pipelines and systems that power reliable data products.",
      icon: "database",
    },
    {
      title: "Applied Problem Solving",
      description: "Tackle real-world challenges with data-driven and creative approaches.",
      icon: "idea",
    },
    {
      title: "Professional & Ethical Practice",
      description: "Communicate, collaborate and act with integrity and responsibility.",
      icon: "people",
    },
  ],
  journey: [
    { year: "Year 1", label: "Foundations" },
    { year: "Year 2", label: "Core data + computing" },
    { year: "Year 3", label: "Advanced / applied study" },
    { year: "Year 4", label: "Internship + capstone" },
  ],
  curriculumPreview: {
    heading: "Curriculum preview",
    note: "Illustrative homepage preview. The official public curriculum will show only the currently approved, active programme version.",
    semesters: [
      {
        title: "Semester 1 examples",
        courses: [
          { code: "DSE101", title: "Introduction to Programming" },
          { code: "MATH101", title: "Calculus I" },
          { code: "STAT101", title: "Statistics Fundamentals" },
          { code: "ENG101", title: "Engineering Fundamentals" },
        ],
      },
      {
        title: "Semester 2 examples",
        courses: [
          { code: "DSE102", title: "Object-Oriented Programming" },
          { code: "MATH102", title: "Calculus II" },
          { code: "STAT102", title: "Probability & Distributions" },
          { code: "DSCI103", title: "Data Wrangling" },
        ],
      },
    ],
  },
  practice: [
    { title: "Projects", description: "Build useful solutions from authentic problems.", icon: "project" },
    { title: "Labs", description: "Learn through hands-on experiments and tools.", icon: "lab" },
    { title: "Practicum", description: "Apply knowledge through structured practical work.", icon: "practicum" },
    { title: "Internship", description: "Gain meaningful exposure to industry practice.", icon: "internship" },
    { title: "Final Project", description: "Deliver capstone work that demonstrates impact.", icon: "capstone" },
  ],
  careers: [
    "Data Scientist",
    "Data Engineer",
    "ML / AI Engineer",
    "Analytics",
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
