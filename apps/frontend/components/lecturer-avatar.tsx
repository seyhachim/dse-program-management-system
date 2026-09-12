"use client";

import { useState } from "react";

type LecturerAvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASSES = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-xl",
} as const;

export function LecturerAvatar({ name, imageUrl, size = "md" }: LecturerAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
  const showImage = Boolean(imageUrl && failedUrl !== imageUrl);

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-primary/10 font-semibold text-primary ${SIZE_CLASSES[size]}`}
      aria-label={`${name} profile image`}
    >
      {showImage ? (
        // Arbitrary stable HTTPS staff-photo hosts cannot be enumerated safely in next.config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl!}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl!)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}
