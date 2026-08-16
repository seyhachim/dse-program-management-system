"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { AUTH_MODE, getSupabase } from "../../../lib/supabase";

type State = "checking" | "idle" | "linking" | "linked" | "error";

export default function TelegramLinkPage() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [verificationId, setVerificationId] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("verificationId") ?? "";
    setVerificationId(id);
    if (!id) {
      setState("error");
      setMessage("Telegram verification is missing. Reopen the DSE Mini App and try again.");
      return;
    }
    if (AUTH_MODE !== "supabase") {
      setState("idle");
      return;
    }
    void getSupabase().auth.getSession().then(({ data }) => {
      if (data.session) {
        setState("idle");
        return;
      }
      const returnPath = `/telegram/link?verificationId=${encodeURIComponent(id)}`;
      window.location.replace(`/login?next=${encodeURIComponent(returnPath)}`);
    });
  }, []);

  async function link() {
    if (!verificationId) return;
    setState("linking");
    try {
      await api.post("/api/telegram/account/link", { verificationId });
      setState("linked");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not link Telegram");
    }
  }

  return (
    <section className="space-y-5">
      <header><p className="text-sm font-medium text-slate-500">DSE PMS</p><h1 className="text-2xl font-semibold">Link Telegram</h1></header>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {state === "checking" ? <p className="text-sm text-slate-500">Checking your PMS session…</p> : state === "linked" ? (
          <div className="space-y-3"><p className="font-medium text-emerald-700">Telegram linked successfully.</p><p className="text-sm text-slate-600">Return to Telegram and reopen the DSE Mini App. Your current PMS permissions will be applied automatically.</p></div>
        ) : (
          <div className="space-y-4"><p className="text-sm text-slate-600">This confirms that the Telegram account you just verified belongs to your currently signed-in PMS account. Telegram names are never used to choose your PMS identity.</p>{state === "error" ? <p className="text-sm text-red-700">{message}</p> : null}<button type="button" disabled={!verificationId || state === "linking" || state === "error"} onClick={() => void link()} className="min-h-11 w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{state === "linking" ? "Linking…" : "Confirm link"}</button></div>
        )}
      </div>
    </section>
  );
}
