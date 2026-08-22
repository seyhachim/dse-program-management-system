"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ProgrammeTheme = "system" | "light" | "dark";

const STORAGE_KEY = "dse-program-theme";
const themeOrder: ProgrammeTheme[] = ["system", "light", "dark"];

function applyTheme(theme: ProgrammeTheme) {
  if (theme === "system") {
    delete document.documentElement.dataset.programTheme;
    return;
  }

  document.documentElement.dataset.programTheme = theme;
}

export function ProgrammeThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ProgrammeTheme>("system");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme: ProgrammeTheme = saved === "light" || saved === "dark" ? saved : "system";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  function cycleTheme() {
    const currentIndex = themeOrder.indexOf(theme);
    const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length] ?? "system";

    setTheme(nextTheme);
    applyTheme(nextTheme);

    if (nextTheme === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    }
  }

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "system" ? "System theme" : `${theme[0]?.toUpperCase()}${theme.slice(1)} theme`;

  return (
    <button
      type="button"
      className={className}
      onClick={cycleTheme}
      aria-label={`${label}. Change colour theme.`}
      title={`${label} · click to change`}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}
