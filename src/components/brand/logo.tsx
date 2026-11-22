import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  size = 32,
  title = "FREMIQ",
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient
          id="fremiq-mark-gradient"
          x1="14"
          y1="12"
          x2="50"
          y2="52"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E9D5FF" />
          <stop offset="0.5" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#101116" />
      <rect
        x="0.5"
        y="0.5"
        width="63"
        height="63"
        rx="15.5"
        fill="none"
        stroke="#30313C"
      />
      <path
        d="M19 15h27v8.5H28.5v7.2h14.8v8.4H28.5V49H19V15Z"
        fill="url(#fremiq-mark-gradient)"
      />
      <path
        d="M42.5 35.5 48 41l-5.5 5.5"
        fill="none"
        stroke="#F5F5F7"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

export function BrandWordmark({
  className,
  size = 30,
  showTagline = false,
}: {
  className?: string;
  size?: number;
  showTagline?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      <div className="min-w-0">
        <div
          className="font-semibold leading-none tracking-[0.24em] text-foreground"
          style={{ fontSize: size * 0.46 }}
        >
          FREMIQ
        </div>
        {showTagline ? (
          <div className="mt-1 truncate text-[10px] tracking-wide text-muted-foreground">
            The intelligence behind every frame.
          </div>
        ) : null}
      </div>
    </div>
  );
}
