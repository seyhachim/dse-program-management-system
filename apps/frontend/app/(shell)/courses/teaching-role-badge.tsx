export function TeachingRoleBadge({
  role,
}: {
  role: "Primary" | "Co-Lecturer";
}) {
  const isPrimary = role === "Primary";

  return (
    <span
      className={
        isPrimary
          ? "inline-flex items-center rounded-full border border-status-tournament/30 bg-status-tournament/10 px-2.5 py-1 text-xs font-semibold text-status-tournament"
          : "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
      }
    >
      {isPrimary ? "Primary Lecturer" : "Co-Lecturer"}
    </span>
  );
}
