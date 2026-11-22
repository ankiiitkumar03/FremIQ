import { BrandMark } from "@/components/brand/logo";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-brand/25 blur-xl" />
        <div style={{ animation: "fremiq-pulse 1.8s ease-in-out infinite" }}>
          <BrandMark size={48} />
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium tracking-[0.22em]">FREMIQ</div>
        <div className="mt-1 text-xs text-muted-foreground">Preparing your workspace…</div>
      </div>
    </div>
  );
}
