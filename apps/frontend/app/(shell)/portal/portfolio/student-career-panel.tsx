"use client";
import { useEffect, useState } from "react";
import { EMPTY_STUDENT_CAREER_PROFILE, type StudentCareerProfile } from "@dse-pms/shared-types";
import { StudentCareerFields } from "@/components/student-career-fields";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const path = "/api/student-portal/career-profile";
export function StudentCareerPanel() {
  const { me, loading } = useMe();
  const allowed = Boolean(me?.roles.includes("student"));
  const [value,setValue] = useState<StudentCareerProfile>(EMPTY_STUDENT_CAREER_PROFILE);
  const [ready,setReady] = useState(false);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  useEffect(()=>{
    if (!allowed) return;
    let active = true;
    setReady(false); setMessage("");
    void api.get<StudentCareerProfile>(path).then(result=>{if(active){setValue(result);setReady(true);}}).catch(()=>{if(active)setMessage("Could not load your career profile. Refresh to retry.");});
    return ()=>{active=false;};
  },[allowed,me?.id]);
  async function save() {
    if(!ready||saving)return;
    setSaving(true);setMessage("");
    try {setValue(await api.put<StudentCareerProfile>(path,value));setMessage("Career preferences saved.");}
    catch{setMessage("Could not save preferences. Try again.");}
    finally{setSaving(false);}
  }
  if(loading||!allowed)return null;
  return <section className="mb-6 space-y-4 rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">Private development profile</h2><p className="text-sm text-muted-foreground">Used for Opportunity Bank suggestions. Separate from the public portfolio.</p>{ready?<><StudentCareerFields value={value} onChange={setValue} disabled={saving}/><button type="button" disabled={saving} onClick={()=>void save()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving?"Saving…":"Save preferences"}</button></>:null}{message&&<p role="status" className="text-sm">{message}</p>}</section>;
}
