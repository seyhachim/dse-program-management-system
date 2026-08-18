import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { CourseDeliveryClient } from "./course-delivery-client";

export default function CourseDeliveryPage() {
  return (
    <div className="relative">
      <Link
        href="/course-delivery/result-access"
        className="fixed right-5 top-4 z-40 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium shadow-sm transition hover:bg-muted"
      >
        <LockKeyhole className="h-4 w-4" />
        Result access
      </Link>
      <CourseDeliveryClient />
    </div>
  );
}
