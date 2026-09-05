import type { Metadata } from "next";
import { ProgrammeLive } from "./program-live";

export const metadata: Metadata = {
  title: "Data Science & Engineering | RUPP",
  description:
    "Discover the Data Science & Engineering programme at the Faculty of Engineering, RUPP.",
};

export default function ProgrammePage() {
  return <ProgrammeLive />;
}
