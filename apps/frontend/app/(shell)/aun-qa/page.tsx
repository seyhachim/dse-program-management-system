import Link from "next/link";
import { BookOpenCheck } from "lucide-react";
import { Topbar } from "../topbar";
import { AunQaWorkspaceClient } from "./workspace-client";

export default function AunQaWorkspacePage() {
  return (
    <>
      <Topbar
        title="AUN-QA Workspace"
        subtitle="Assign requirements, collect evidence, and prepare evidence-grounded SAR work"
      />
      <main className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
        <Link
          href="/aun-qa/knowledge-sources"
          className="flex items-start gap-3 rounded-xl border bg-card p-4 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="rounded-lg border bg-muted/40 p-2" aria-hidden="true">
            <BookOpenCheck className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-medium">Trusted Knowledge Sources</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Register and verify exact source versions for AUN-QA, Cambodia OBE, RUPP, Faculty of Engineering, and DSE.
            </span>
          </span>
        </Link>
        <AunQaWorkspaceClient />
      </main>
    </>
  );
}
