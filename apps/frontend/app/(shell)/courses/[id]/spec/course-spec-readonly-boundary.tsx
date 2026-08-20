"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

const SAFE_BUTTON_PATTERN =
  /\b(preview|rubric library|export|filter|view|report|heatmap|print|download|dismiss|close|go to)\b/i;

function isSafeReadOnlyControl(control: HTMLElement): boolean {
  if (control instanceof HTMLInputElement) {
    return (
      control.type === "search" ||
      /^search\b/i.test(control.placeholder.trim())
    );
  }

  if (control instanceof HTMLSelectElement) {
    return Array.from(control.options).some((option) =>
      /^all clos$/i.test(option.textContent?.trim() ?? ""),
    );
  }

  if (control instanceof HTMLButtonElement) {
    const label = [
      control.textContent,
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
    ]
      .filter(Boolean)
      .join(" ");

    return SAFE_BUTTON_PATTERN.test(label);
  }

  return false;
}

/**
 * Keeps the existing Course Specification sections useful for inspection while
 * preventing their mutation controls from firing in submitted/reviewed versions.
 *
 * Safe inspection controls (search/filter/preview/export/report/navigation) stay
 * available. Links are intentionally untouched. Backend workflow guards remain
 * the final authority for mutation protection.
 */
export function CourseSpecReadOnlyBoundary({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const disableMutationControls = () => {
      const controls = root.querySelectorAll<HTMLElement>(
        "button, input, textarea, select",
      );

      controls.forEach((control) => {
        if (isSafeReadOnlyControl(control)) return;

        if (
          control instanceof HTMLButtonElement ||
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement ||
          control instanceof HTMLSelectElement
        ) {
          if (!control.disabled) {
            control.disabled = true;
            control.setAttribute("data-course-spec-readonly-disabled", "true");
          }
        }
      });
    };

    disableMutationControls();

    const observer = new MutationObserver(disableMutationControls);
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} data-course-spec-readonly-boundary="true">
      {children}
    </div>
  );
}
