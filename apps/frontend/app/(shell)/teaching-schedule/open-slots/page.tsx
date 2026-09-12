import { Topbar } from "../../topbar";
import { OpenTeachingSlotBoardClient } from "./open-teaching-slot-board-client";

export default function OpenTeachingSlotBoardPage() {
  return (
    <>
      <Topbar
        title="Open Teaching Slots"
        subtitle="Request a released class time for another course you teach to the same class"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <OpenTeachingSlotBoardClient />
      </main>
    </>
  );
}
