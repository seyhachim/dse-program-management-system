import Link from "next/link";
import { Part2ReadinessClient } from "./part2-readiness-client";
import { SarBookClient } from "./sar-book-client";

export default function SarBookPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div>
          <div className="text-sm font-semibold">Part 3 structured analysis</div>
          <p className="text-sm text-muted-foreground">
            Record human 1–7 self-ratings, criterion opinions, narrative links, and the canonical improvement plan.
          </p>
        </div>
        <Link
          href="/aun-qa/sar/part3"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Open Part 3
        </Link>
      </div>
      <SarBookClient />
      <Part2ReadinessClient />
    </div>
  );
}
