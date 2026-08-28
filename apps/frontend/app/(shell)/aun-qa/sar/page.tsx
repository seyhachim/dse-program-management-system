import { Part2ReadinessClient } from "./part2-readiness-client";
import { SarBookClient } from "./sar-book-client";

export default function SarBookPage() {
  return (
    <div className="space-y-4">
      <SarBookClient />
      <Part2ReadinessClient />
    </div>
  );
}
