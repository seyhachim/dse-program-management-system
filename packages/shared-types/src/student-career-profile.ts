import { z } from "zod";

export const STUDENT_INTERESTS = [
  "Artificial Intelligence (AI)", "Machine Learning (ML)", "Data Science (DS)",
  "Data Analytics & Visualization", "Data Engineering", "Software Engineering",
  "Web Development", "Mobile App Development", "Cloud Computing & DevOps",
  "Cybersecurity", "IoT & Embedded Systems", "Robotics", "Smart Agriculture",
  "Research & Innovation", "Entrepreneurship", "Not sure yet",
] as const;
export const STUDENT_PROGRAMMING_LEVELS = ["No experience yet", "Beginner", "Intermediate", "Advanced"] as const;
export const STUDENT_CAREER_GOALS = ["Technology industry", "Research and higher education", "Startup or business", "Still exploring"] as const;
export const STUDENT_OPPORTUNITY_INTERESTS = ["internship", "hackathon", "competition", "scholarship", "exchange", "research", "training"] as const;
export const StudentCareerProfileSchema = z.object({
  interests: z.array(z.enum(STUDENT_INTERESTS)).max(STUDENT_INTERESTS.length).transform(v => [...new Set(v)]),
  programmingLevel: z.enum(STUDENT_PROGRAMMING_LEVELS).nullable(),
  careerGoal: z.enum(STUDENT_CAREER_GOALS).nullable(),
  opportunityInterests: z.array(z.enum(STUDENT_OPPORTUNITY_INTERESTS)).max(STUDENT_OPPORTUNITY_INTERESTS.length).transform(v => [...new Set(v)]),
}).strict().refine(v => !v.interests.includes("Not sure yet") || v.interests.length === 1, { path: ["interests"], message: "Not sure yet must be selected alone" });
export type StudentCareerProfile = z.infer<typeof StudentCareerProfileSchema>;
export const EMPTY_STUDENT_CAREER_PROFILE: StudentCareerProfile = { interests: [], programmingLevel: null, careerGoal: null, opportunityInterests: [] };

const keywords: Partial<Record<typeof STUDENT_INTERESTS[number], string[]>> = {
  "Artificial Intelligence (AI)": ["artificial intelligence", " ai ", "generative ai"],
  "Machine Learning (ML)": ["machine learning", "deep learning", " ml "],
  "Data Science (DS)": ["data science", "data scientist"],
  "Data Analytics & Visualization": ["data analytics", "data visualization", "business intelligence"],
  "Data Engineering": ["data engineering", "data pipeline"],
  "Software Engineering": ["software engineering", "software development"],
  "Web Development": ["web development", "web app", "frontend", "backend"],
  "Mobile App Development": ["mobile app", "android", "ios development"],
  "Cloud Computing & DevOps": ["cloud computing", "devops", "cloud engineering"],
  "Cybersecurity": ["cybersecurity", "cyber security", "information security"],
  "IoT & Embedded Systems": ["internet of things", " iot ", "embedded systems"],
  "Robotics": ["robotics", "robot"],
  "Smart Agriculture": ["smart agriculture", "agritech", "precision agriculture"],
  "Research & Innovation": ["research", "innovation"],
  "Entrepreneurship": ["entrepreneurship", "startup", "start-up"],
};
/** Suggestions only, never eligibility or an access filter. */
export function matchCareerOpportunity(profile: StudentCareerProfile, opportunity: { type: string; title: string; summary: string }): string[] {
  const content = " " + (opportunity.title + " " + opportunity.summary).toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  const reasons: string[] = profile.interests.filter(interest => keywords[interest]?.some(word => content.includes(word)));
  if (profile.opportunityInterests.some(type => type === opportunity.type)) reasons.push(opportunity.type);
  return reasons;
}
