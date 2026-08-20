import Link from "next/link";
import { Topbar } from "../topbar";
import { PublicInformationClient } from "./public-information-client";

export default function PublicInformationPage() {
  return (
    <>
      <Topbar
        title="Public Information"
        subtitle="Manage DSE programme information published to public channels"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto mb-4 flex w-full max-w-6xl justify-end">
          <Link
            href="/public-information/questions"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Ask DSE gaps
          </Link>
        </div>
        <PublicInformationClient />
      </main>
    </>
  );
}
