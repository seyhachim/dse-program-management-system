"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../../../lib/api";
import { AUTH_MODE, getSupabase } from "../../../lib/supabase";

type State = "checking" | "confirm" | "linking" | "linked" | "error";

type PmsProfile = {
  id: string;
  email: string;
  name: string;
  role?: string;
  roles: string[];
};

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function linkErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Could not connect Telegram to DSE PMS.";
  }
  const normalized = error.message.toLowerCase();
  if (error.status === 409 || normalized.includes("already") || normalized.includes("conflict")) {
    return "This Telegram or DSE PMS account is already connected elsewhere. Disconnect the existing Telegram connection in PMS Account Settings, then reopen the official Mini App and try again.";
  }
  if (error.status === 401 || normalized.includes("expired")) {
    return "Your Telegram verification is no longer valid. Close this window and reopen DSE PMS from the official Telegram bot.";
  }
  if (error.status === 403 || normalized.includes("provision")) {
    return "Your sign-in was successful, but this account is not provisioned for DSE PMS access. Contact your programme administrator.";
  }
  return error.message || "Could not connect Telegram to DSE PMS.";
}

export default function TelegramLinkPage() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [profile, setProfile] = useState<PmsProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      const id = new URLSearchParams(window.location.search).get("verificationId") ?? "";
      setVerificationId(id);
      if (!id) {
        setState("error");
        setMessage("Telegram verification is missing. Reopen the DSE Mini App from the official Telegram bot and try again.");
        return;
      }

      if (AUTH_MODE === "supabase") {
        const { data } = await getSupabase().auth.getSession();
        if (!data.session) {
          const returnPath = `/telegram/link?verificationId=${encodeURIComponent(id)}`;
          window.location.replace(`/login?next=${encodeURIComponent(returnPath)}`);
          return;
        }
      }

      try {
        const current = await api.get<PmsProfile>("/api/auth/me");
        if (!cancelled) {
          setProfile(current);
          setState("confirm");
        }
      } catch (error) {
        if (!cancelled) {
          setState("error");
          setMessage(error instanceof Error ? error.message : "Could not confirm your DSE PMS account.");
        }
      }
    }

    void prepare();
    return () => { cancelled = true; };
  }, []);

  async function link() {
    if (!verificationId || !profile) return;
    setState("linking");
    setMessage("");
    try {
      await api.post("/api/telegram/account/link", { verificationId });
      setState("linked");
    } catch (error) {
      setState("error");
      setMessage(linkErrorMessage(error));
    }
  }

  async function useDifferentAccount() {
    if (!verificationId) return;
    if (AUTH_MODE === "supabase") {
      await getSupabase().auth.signOut();
    }
    const returnPath = `/telegram/link?verificationId=${encodeURIComponent(verificationId)}`;
    window.location.replace(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  function returnToTelegram() {
    const webApp = (window as typeof window & { Telegram?: { WebApp?: { close?: () => void } } }).Telegram?.WebApp;
    if (webApp?.close) {
      webApp.close();
      return;
    }
    window.location.replace("/telegram");
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">DSE PMS</p>
        <h1 className="text-2xl font-semibold tracking-tight">Connect your DSE PMS account</h1>
        <p className="text-sm leading-6 text-slate-600">
          Confirm the PMS identity that should be connected to this verified Telegram account.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {state === "checking" ? (
          <div className="space-y-2">
            <p className="font-medium text-slate-900">Checking your PMS session…</p>
            <p className="text-sm text-slate-600">We are confirming your signed-in DSE PMS account before creating any connection.</p>
          </div>
        ) : state === "linked" && profile ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-lg font-semibold text-emerald-700">✓</div>
              <div>
                <p className="text-lg font-semibold text-slate-950">Account connected</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Your Telegram account is now connected to DSE PMS.</p>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-semibold text-slate-950">{profile.name}</p>
              <p className="mt-1 text-sm text-slate-600">{profile.roles.map(roleLabel).join(" · ")}</p>
              <p className="mt-1 text-xs text-slate-500">{profile.email}</p>
            </div>

            <p className="text-xs leading-5 text-slate-500">
              Your roles and permissions still come from DSE PMS and are re-checked when you use protected Mini App features.
            </p>

            <button
              type="button"
              onClick={returnToTelegram}
              className="min-h-11 w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
            >
              Return to Telegram
            </button>
          </div>
        ) : state === "confirm" && profile ? (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-slate-500">You are about to connect this Telegram account to</p>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-lg font-semibold text-slate-950">{profile.name}</p>
                <p className="mt-1 text-sm text-slate-600">{profile.roles.map(roleLabel).join(" · ")}</p>
                <p className="mt-1 text-xs text-slate-500">{profile.email}</p>
              </div>
            </div>

            <p className="text-sm leading-6 text-slate-600">
              After connecting, this Telegram account will use this PMS identity and its current permissions. One Telegram account can be connected to only one PMS account at a time.
            </p>

            <button
              type="button"
              onClick={() => void link()}
              className="min-h-11 w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
            >
              Yes, connect this account
            </button>
            <button
              type="button"
              onClick={() => void useDifferentAccount()}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
            >
              This is not my account
            </button>

            <p className="text-xs leading-5 text-slate-500">
              Choosing “This is not my account” does not create or replace a Telegram link. You will sign in to DSE PMS again with the correct account.
            </p>
          </div>
        ) : state === "linking" && profile ? (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold text-slate-950">Connecting your account…</p>
              <p className="mt-1 text-sm text-slate-600">Verifying your Telegram identity and DSE PMS account.</p>
            </div>
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              <p>✓ Telegram identity verified</p>
              <p>✓ PMS account confirmed: {profile.name}</p>
              <p className="font-medium">Connecting accounts…</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold text-red-800">Could not connect account</p>
              <p className="mt-2 text-sm leading-6 text-red-700">{message}</p>
            </div>
            {verificationId ? (
              <button
                type="button"
                onClick={() => void useDifferentAccount()}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
              >
                Sign in with another PMS account
              </button>
            ) : null}
            <p className="text-xs leading-5 text-slate-500">
              A different PMS identity is never linked silently. If an existing connection must change, disconnect it first and start again from a fresh Telegram Mini App launch.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
