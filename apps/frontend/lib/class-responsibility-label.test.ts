import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { classResponsibilityLabel } from "./class-responsibility-label";

const monitorDeliverySource = readFileSync(
  new URL("../app/(shell)/portal/schedule/delivery/monitor-delivery-form.tsx", import.meta.url),
  "utf8",
);
const telegramDeliverySource = readFileSync(
  new URL("../app/telegram/classes/[offeringId]/delivery/page.tsx", import.meta.url),
  "utf8",
);

describe("class responsibility display labels", () => {
  test("uses the approved user-facing terminology", () => {
    expect(classResponsibilityLabel("ClassMonitor")).toBe("Class Monitor");
    expect(classResponsibilityLabel("SubClassMonitor")).toBe("Deputy Class Monitor");
  });

  test("keeps current delivery surfaces on the shared terminology", () => {
    expect(monitorDeliverySource).toContain("classResponsibilityLabel(context.responsibility.role)");
    expect(telegramDeliverySource).toContain("classResponsibilityLabel(actorKind)");
    expect(monitorDeliverySource).not.toContain("Sub-class Monitor");
    expect(telegramDeliverySource).not.toContain("Sub-class Monitor");
  });
});
