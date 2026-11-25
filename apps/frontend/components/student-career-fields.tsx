"use client";
import { STUDENT_INTERESTS, STUDENT_PROGRAMMING_LEVELS, STUDENT_CAREER_GOALS, STUDENT_OPPORTUNITY_INTERESTS, type StudentCareerProfile } from "@dse-pms/shared-types";

export function StudentCareerFields({ value, onChange, disabled = false }: { value: StudentCareerProfile; onChange: (value: StudentCareerProfile) => void; disabled?: boolean }) {
  function toggleInterest(item: StudentCareerProfile["interests"][number]) {
    const current = value.interests;
    const next = current.includes(item) ? current.filter(x => x !== item) : item === "Not sure yet" ? [item] : [...current.filter(x => x !== "Not sure yet"), item];
    onChange({ ...value, interests: next });
  }
  return <fieldset disabled={disabled} className="space-y-4">
    <legend className="text-base font-semibold">Interests & career profile (optional)</legend>
    <p className="text-sm opacity-75">Choose what you want to explore. These preferences are private and can be edited later. They do not affect admission, grades or opportunity eligibility.</p>
    <div className="space-y-2"><p className="text-sm font-medium">Technical interests</p><div className="flex flex-wrap gap-2">{STUDENT_INTERESTS.map(item => <label key={item} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={value.interests.includes(item)} onChange={() => toggleInterest(item)} />{item}</label>)}</div></div>
    <label className="block space-y-1 text-sm font-medium">Programming experience<select className="block w-full rounded-lg border bg-transparent px-3 py-2" value={value.programmingLevel ?? ""} onChange={e => onChange({...value, programmingLevel: STUDENT_PROGRAMMING_LEVELS.find(x=>x===e.target.value) ?? null})}><option value="">Prefer not to answer</option>{STUDENT_PROGRAMMING_LEVELS.map(item=><option key={item}>{item}</option>)}</select></label>
    <label className="block space-y-1 text-sm font-medium">Career goal<select className="block w-full rounded-lg border bg-transparent px-3 py-2" value={value.careerGoal ?? ""} onChange={e => onChange({...value,careerGoal: STUDENT_CAREER_GOALS.find(x=>x===e.target.value) ?? null})}><option value="">Prefer not to answer</option>{STUDENT_CAREER_GOALS.map(item=><option key={item}>{item}</option>)}</select></label>
    <div className="space-y-2"><p className="text-sm font-medium">Opportunity preferences</p><div className="flex flex-wrap gap-2">{STUDENT_OPPORTUNITY_INTERESTS.map(item=><label key={item} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm capitalize"><input type="checkbox" checked={value.opportunityInterests.includes(item)} onChange={()=>onChange({...value,opportunityInterests:value.opportunityInterests.includes(item)?value.opportunityInterests.filter(x=>x!==item):[...value.opportunityInterests,item]})}/>{item}</label>)}</div></div>
  </fieldset>;
}
