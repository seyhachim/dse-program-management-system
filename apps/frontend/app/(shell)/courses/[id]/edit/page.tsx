import { CourseFormPage } from "../../course-form-page";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CourseFormPage courseId={id} />;
}
