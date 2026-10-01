import { Topbar } from "../../topbar";
import { PortalCourses } from "./portal-courses";

export default function PortalCoursesPage() {
  return (
    <>
      <Topbar
        title="My Courses"
        subtitle="Your courses, attendance, and learning information"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-7 lg:p-8">
        <PortalCourses />
      </main>
    </>
  );
}
