import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Topbar } from "../../topbar";
import { PublicInformationLifecycleClient } from "./public-information-lifecycle-client";

export default function PublicInformationLifecyclePage() {
  return (
    <>
      <Topbar
        title="Public Information Lifecycle"
        subtitle="Review hidden and archived FAQs and important dates without losing public history"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <Link
            href="/public-information"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Public Information
          </Link>
          <PublicInformationLifecycleClient />
        </div>
      </main>
    </>
  );
}
