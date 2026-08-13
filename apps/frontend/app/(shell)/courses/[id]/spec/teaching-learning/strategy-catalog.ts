export type TeachingPhilosophyOption = {
  id: string;
  label: string;
};

export type ActiveLearningStrategy = {
  id: string;
  label: string;
};

export type ActiveLearningCluster = {
  id: string;
  label: string;
  description: string;
  strategies: ActiveLearningStrategy[];
};

export const TEACHING_PHILOSOPHY_OPTIONS: TeachingPhilosophyOption[] = [
  { id: "student-centered", label: "Student-centered" },
  { id: "applied", label: "Applied learning" },
  { id: "inquiry", label: "Inquiry-driven" },
  { id: "collaborative", label: "Collaborative" },
  { id: "experiential", label: "Experiential" },
];

export const ACTIVE_LEARNING_CLUSTERS: ActiveLearningCluster[] = [
  {
    id: "collaborate",
    label: "Collaborate",
    description: "Students learn with others.",
    strategies: [
      { id: "think-pair-share", label: "Think–Pair–Share" },
      { id: "group-discussion", label: "Group Discussion" },
      { id: "peer-instruction", label: "Peer Instruction" },
      { id: "jigsaw", label: "Jigsaw" },
      { id: "team-problem-solving", label: "Team Problem Solving" },
    ],
  },
  {
    id: "solve",
    label: "Solve",
    description: "Students investigate and solve problems.",
    strategies: [
      { id: "problem-based-learning", label: "Problem-Based Learning" },
      { id: "case-based-learning", label: "Case-Based Learning" },
      { id: "inquiry-activity", label: "Inquiry Activity" },
      { id: "data-investigation", label: "Data Investigation" },
    ],
  },
  {
    id: "practice",
    label: "Practice",
    description: "Students learn by doing.",
    strategies: [
      { id: "hands-on-lab", label: "Hands-on Lab" },
      { id: "coding-exercise", label: "Coding Exercise" },
      { id: "project-based-learning", label: "Project-Based Learning" },
      { id: "prototype-build", label: "Prototype / Build Task" },
    ],
  },
  {
    id: "reflect",
    label: "Reflect",
    description: "Students improve through reflection and feedback.",
    strategies: [
      { id: "peer-review", label: "Peer Review" },
      { id: "minute-paper", label: "Minute Paper" },
      { id: "reflection", label: "Reflection" },
      { id: "self-assessment", label: "Self-Assessment" },
    ],
  },
  {
    id: "communicate",
    label: "Communicate",
    description: "Students explain and present what they know.",
    strategies: [
      { id: "presentation", label: "Presentation" },
      { id: "debate", label: "Debate" },
      { id: "demo", label: "Demo" },
      { id: "poster-sharing", label: "Poster Sharing" },
    ],
  },
];

export const INDEPENDENT_LEARNING_OPTIONS = [
  "Reading",
  "Practice Exercises",
  "Project Work",
  "Video",
  "Reflection",
] as const;

export const RESOURCE_TYPE_OPTIONS = [
  "Slides",
  "Readings",
  "Datasets",
  "Worksheets",
  "Videos",
  "Case Studies",
] as const;

export const TECHNOLOGY_OPTIONS = [
  "LMS",
  "Jupyter",
  "GitHub",
  "Google Colab",
  "Discussion Forum",
] as const;
