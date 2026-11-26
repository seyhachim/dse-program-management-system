import { z } from "zod";
import type { ExamWorkspaceSnapshot } from "@dse-pms/shared-types";

const opaqueRef = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
const label = z.string().trim().min(1).max(80);
export const bloomLevels = ["Remember","Understand","Apply","Analyze","Evaluate","Create"] as const;
export const academicBlueprintSchema = z.object({
  durationMinutes: z.number().int().min(1).max(720),
  conditions: z.string().trim().min(3).max(1000),
  restrictedSchemeRef: opaqueRef,
  components: z.array(z.object({
    questionId: z.string().min(1).max(256),
    // Parent is a display group only; each leaf has the original immutable question ID.
    parentLabel: label, componentLabel: label, topic: label,
    bloom: z.enum(bloomLevels),
    expectedAnswerRef: opaqueRef,
    partialCredit: z.string().trim().min(3).max(2000),
  }).strict()).min(1).max(1000),
}).strict();
export type AcademicBlueprintInput = z.infer<typeof academicBlueprintSchema>;
export const equivalenceSchema = z.object({
  coverage: z.literal(true), cognitiveDemand: z.literal(true), difficulty: z.literal(true),
  workload: z.literal(true), scoringRules: z.literal(true), fairness: z.literal(true),
  rationale: z.string().trim().min(10).max(2000),
}).strict();

export function buildAcademicBlueprint(snapshot: ExamWorkspaceSnapshot, input: unknown) {
  const parsed = academicBlueprintSchema.parse(input);
  const byId = new Map(parsed.components.map(c=>[c.questionId,c]));
  if (byId.size!==parsed.components.length || byId.size!==snapshot.questions.length) throw new Error("Each scored component must occur exactly once");
  const labels = new Set<string>();
  const components = snapshot.questions.map(q=>{
    const item=byId.get(q.questionId);
    if(!item) throw new Error("Blueprint must cover every scored component");
    const key=JSON.stringify([item.parentLabel.toLowerCase(),item.componentLabel.toLowerCase()]);
    if(labels.has(key)) throw new Error("Duplicate component label within parent");
    labels.add(key);
    return {...item,maxPoints:q.maxPoints,cloCode:q.cloCode,evidence:q.evidence};
  });
  return {...parsed,components};
}
export type AcademicBlueprint = ReturnType<typeof buildAcademicBlueprint>;
export function blueprintDistribution(blueprint: AcademicBlueprint) {
  const groups = new Map<string,{cloCode:string;evidence:"direct"|"supporting";bloom:typeof bloomLevels[number];points:number}>();
  for(const q of blueprint.components) {
    const key=JSON.stringify([q.cloCode,q.evidence,q.bloom]);
    const prior=groups.get(key);
    groups.set(key,{cloCode:q.cloCode,evidence:q.evidence,bloom:q.bloom,points:(prior?.points??0)+q.maxPoints});
  }
  return [...groups.values()].sort((a,b)=>JSON.stringify([a.cloCode,a.evidence,a.bloom]).localeCompare(JSON.stringify([b.cloCode,b.evidence,b.bloom])));
}
