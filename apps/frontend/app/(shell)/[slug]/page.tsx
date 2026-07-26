import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { navFromManifests, pluginManifests } from "@dse-pms/shared-types";
import { Topbar } from "../topbar";

/**
 * Generic "coming soon" page for sidebar entries with no real functionality
 * yet (issue #49). Only matches paths with no dedicated static route folder
 * (courses/students/offerings/lecturers take precedence), so this one file
 * serves every placeholder nav item without a page.tsx per route.
 */
export default async function PlaceholderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const route = navFromManifests(pluginManifests).find((r) => r.path === `/${slug}`);
  if (!route) notFound();

  return (
    <>
      <Topbar title={route.label} subtitle="Coming soon" />
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Construction className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">This page is coming in a later phase.</p>
      </main>
    </>
  );
}
