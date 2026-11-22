import { cn } from "@/lib/utils";

type Variant = "media" | "jobs" | "projects" | "agents" | "subtitles" | "search";

export function EmptyArt({
  variant = "projects",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const stroke = "#A78BFA";
  const dim = "#3A3B47";
  return (
    <svg
      viewBox="0 0 160 120"
      className={cn("h-28 w-36", className)}
      aria-hidden="true"
      fill="none"
    >
      <rect x="1" y="1" width="158" height="118" rx="14" stroke={dim} />
      <path d="M1 32h158" stroke={dim} />
      <circle cx="16" cy="17" r="3" stroke={dim} />
      <circle cx="28" cy="17" r="3" stroke={dim} />
      <circle cx="40" cy="17" r="3" stroke={dim} />

      {variant === "media" && (
        <>
          <rect x="26" y="48" width="64" height="44" rx="6" stroke={stroke} />
          <path d="M98 62l26-10v40l-26-10V62Z" stroke={dim} />
          <path d="M52 62l14 8-14 8V62Z" stroke={stroke} />
        </>
      )}

      {variant === "jobs" && (
        <>
          <rect x="28" y="48" width="104" height="10" rx="5" stroke={stroke} />
          <rect x="28" y="66" width="72" height="10" rx="5" stroke={stroke} />
          <rect x="28" y="84" width="48" height="10" rx="5" stroke={dim} />
        </>
      )}

      {variant === "projects" && (
        <>
          <path d="M28 52h30l8 8h66v34a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4V52Z" stroke={stroke} />
          <path d="M28 60h104" stroke={dim} />
          <path d="M58 78h44" stroke={dim} />
        </>
      )}

      {variant === "agents" && (
        <>
          <rect x="52" y="50" width="56" height="40" rx="10" stroke={stroke} />
          <circle cx="68" cy="68" r="4" stroke={stroke} />
          <circle cx="92" cy="68" r="4" stroke={stroke} />
          <path d="M80 50V40M72 40h16" stroke={dim} />
          <path d="M66 80h28" stroke={dim} />
        </>
      )}

      {variant === "subtitles" && (
        <>
          <rect x="30" y="56" width="100" height="30" rx="6" stroke={stroke} />
          <path d="M44 66h28M44 74h48M82 66h24" stroke={dim} />
          <path d="M64 96h32" stroke={stroke} />
        </>
      )}

      {variant === "search" && (
        <>
          <circle cx="74" cy="70" r="20" stroke={stroke} />
          <path d="M89 85l16 16" stroke={dim} />
        </>
      )}
    </svg>
  );
}
