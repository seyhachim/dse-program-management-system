import { Topbar } from "../topbar";
import { AnnualLecturerClient } from "./annual-lecturer-client";

export default function AnnualLecturerActivitiesPage() {
  return <><Topbar title="Annual Lecturer Activities" subtitle="Verified teaching and professional evidence, by academic year" />
    <main className="flex-1 overflow-y-auto p-4 sm:p-6"><AnnualLecturerClient /></main></>;
}
