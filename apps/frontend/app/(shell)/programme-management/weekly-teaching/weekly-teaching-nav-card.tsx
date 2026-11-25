"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProgrammeHeadOverview } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { api } from "@/lib/api";

/** Avoid presenting a broken dashboard link to unappointed coordinators/secretaries. */
export function WeeklyTeachingNavCard() {
  const { me, loading } = useMe();
  const [isHead, setIsHead] = useState(false);
  const isAdmin = Boolean(me?.roles.includes("admin"));
  const userId = me?.id;
  const coordinator = Boolean(me?.roles.includes("program_coordinator"));

  useEffect(() => {
    if (loading || isAdmin || !userId || !coordinator) return;
    let mounted = true;
    void api.get<ProgrammeHeadOverview>("/api/auth/programme-head?programmeId=dse")
      .then((result) => {
        if (mounted) setIsHead(result.current?.lecturerId === userId);
      })
      .catch(() => { if (mounted) setIsHead(false); });
    return () => { mounted = false; };
  }, [loading, isAdmin, userId, coordinator]);

  if (loading || (!isAdmin && !isHead)) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex h-full flex-col gap-4">
        <div>
          <h2 className="font-semibold text-foreground">Weekly Teaching Monitor</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin / appointed Head of Program: review scheduled and delivered classes,
            cancellations, approved leave and missing evidence.
          </p>
        </div>
        <Link
          href="/programme-management/weekly-teaching"
          className="mt-auto inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Open Weekly Monitor
        </Link>
      </div>
    </div>
  );
}
