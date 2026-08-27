"use client";

import { useEffect } from "react";

export const ACADEMIC_CALENDAR_REFRESH_EVENT = "dse:academic-calendar-refresh";

export function AcademicCalendarRefreshBridge() {
  useEffect(() => {
    const root = document.querySelector(".academic-calendar-page");
    if (!root) return;

    let lastStatus = "";
    const publishRefresh = () => {
      const currentStatus = Array.from(root.querySelectorAll<HTMLElement>("[role='status']"))
        .map((node) => node.textContent?.trim() ?? "")
        .filter(Boolean)
        .join("|");

      if (!currentStatus) {
        lastStatus = "";
        return;
      }
      if (currentStatus === lastStatus) return;
      lastStatus = currentStatus;
      window.dispatchEvent(new Event(ACADEMIC_CALENDAR_REFRESH_EVENT));
    };

    const observer = new MutationObserver(publishRefresh);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    publishRefresh();

    return () => observer.disconnect();
  }, []);

  return null;
}
