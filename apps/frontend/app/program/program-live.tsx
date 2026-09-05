"use client";

import { useEffect, useState } from "react";
import {
  createPublicProgrammeFallback,
  loadPublicProgrammePageFromBrowser,
} from "@/lib/public-programme-browser";
import type { PublicProgrammePageModel } from "@/lib/public-programme-page";
import { ProgrammeView } from "./program-view";

const fallbackContent = createPublicProgrammeFallback();

export function ProgrammeLive() {
  const [content, setContent] = useState<PublicProgrammePageModel>(fallbackContent);

  useEffect(() => {
    let active = true;

    loadPublicProgrammePageFromBrowser()
      .then((nextContent) => {
        if (active) setContent(nextContent);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return <ProgrammeView content={content} />;
}
