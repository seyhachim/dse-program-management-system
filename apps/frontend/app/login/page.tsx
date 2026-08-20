"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CircleAlert,
  ClipboardCheck,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { Button, Input } from "@dse-pms/ui";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function friendlyLoginError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Email or password is incorrect. Check your details and try again.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }

  return "We could not sign you in right now. Please try again.";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = useMemo(() => safeReturnPath(searchParams.get("next")), [searchParams]);
  const telegramLinking = returnPath.startsWith("/telegram/link?");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  useEffect(() => {
    if (AUTH_MODE !== "supabase") {
      router.replace(returnPath);
      return;
    }
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(returnPath);
      });
  }, [returnPath, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const { error: providerError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (providerError) {
        setError(friendlyLoginError(providerError.message));
        return;
      }

      router.replace(returnPath);
    } catch {
      setError("We could not sign you in right now. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-12">
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-28 bottom-10 h-80 w-80 rounded-full bg-primary-light/10 blur-3xl" />

        <div className="relative flex items-center gap-5">
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
            <div className="flex size-12 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
              <Image src="/rupp-logo.png" alt="Royal University of Phnom Penh" width={40} height={40} priority />
            </div>
            <Image src="/dse-logo.svg" alt="Data Science and Engineering" width={132} height={44} priority className="h-auto w-32" />
          </div>
          <div className="h-10 w-px bg-white/15" />
          <div className="text-sm leading-5 text-sidebar-muted">
            <p className="font-medium text-sidebar-foreground">Royal University of Phnom Penh</p>
            <p>Faculty of Engineering</p>
          </div>
        </div>

        <div className="relative max-w-xl space-y-7">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-sidebar-muted">
            DSE Program Management System
          </div>
          <div className="space-y-4">
            <h2 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Teaching, assessment, and programme quality in one place.
            </h2>
            <p className="max-w-lg text-base leading-7 text-sidebar-muted">
              Sign in to manage course delivery, student results, course specifications, and quality-assurance workflows securely.
            </p>
          </div>

          <div className="grid max-w-lg gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5">
              <ShieldCheck className="size-5 text-primary-light" aria-hidden="true" />
              <span className="text-sm text-sidebar-muted">Secure account access</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5">
              <BookOpenCheck className="size-5 text-primary-light" aria-hidden="true" />
              <span className="text-sm text-sidebar-muted">Course delivery and assessment</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5 sm:col-span-2">
              <ClipboardCheck className="size-5 text-primary-light" aria-hidden="true" />
              <span className="text-sm text-sidebar-muted">Auditable programme and quality workflows</span>
            </div>
          </div>
        </div>

        <p className="relative text-xs leading-5 text-sidebar-muted">
          DSE · Faculty of Engineering · Royal University of Phnom Penh
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12 xl:px-16">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-11 items-center justify-center rounded-xl bg-card p-1.5 shadow-sm ring-1 ring-border">
              <Image src="/rupp-logo.png" alt="Royal University of Phnom Penh" width={36} height={36} priority />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">DSE Program Management System</p>
              <p className="text-xs text-muted-foreground">Faculty of Engineering · RUPP</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_24px_80px_-36px_rgba(15,30,58,0.45)] sm:p-8">
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">Welcome back</p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {telegramLinking ? "Sign in to connect Telegram" : "Sign in to DSE PMS"}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                {telegramLinking
                  ? "Use your usual DSE PMS account. You will confirm the account before Telegram is connected."
                  : "Use your DSE PMS account to continue."}
              </p>
            </div>

            {telegramLinking ? (
              <div className="mt-5 flex gap-3 rounded-xl border border-primary/15 bg-info-bg p-3.5">
                <MessageCircle className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
                <p className="text-xs leading-5 text-foreground-secondary">
                  Telegram never receives or stores your PMS password. Your sign-in only confirms which PMS account should be linked.
                </p>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@rupp.edu.kh"
                    className="h-11 rounded-lg bg-card pl-10 pr-3 text-sm md:text-sm"
                    aria-invalid={Boolean(error)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="password" className="text-sm font-medium text-foreground">
                    Password
                  </label>
                  <Link className="text-sm font-medium text-primary transition-colors hover:text-primary-hover hover:underline" href="/forgot-password">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 rounded-lg bg-card pl-10 pr-11 text-sm md:text-sm"
                    aria-invalid={Boolean(error)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {error ? (
                <div role="alert" aria-live="polite" className="flex gap-2.5 rounded-lg border border-error/20 bg-error-bg px-3.5 py-3 text-sm text-error">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p className="leading-5">{error}</p>
                </div>
              ) : null}

              <Button type="submit" size="lg" className="w-full rounded-lg" disabled={!canSubmit} aria-busy={submitting}>
                {submitting ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  <>
                    {telegramLinking ? "Sign in and continue" : "Sign in"}
                    <ArrowRight aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            <span>Secure sign-in for authorized DSE PMS users</span>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Email + password login. Only meaningful in AUTH_MODE=supabase; in dev mode the
 * app runs on the static dev token, so we just bounce to the requested safe route.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" aria-busy="true" />}>
      <LoginForm />
    </Suspense>
  );
}
