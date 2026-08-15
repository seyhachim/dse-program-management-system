import { Topbar } from "../../topbar";
import { PortalCourses } from "./portal-courses";

export default function PortalCoursesPage() {
  return <><Topbar title="My Courses" subtitle="Your enrolled classes and learning information" /><main className="flex-1 overflow-y-auto p-4 md:p-6"><PortalCourses /></main></>;
}
