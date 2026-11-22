"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/logo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <BrandMark size={44} />
      <div>
        <h1 className="text-xl font-semibold">Something interrupted FREMIQ</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {error.message || "The workspace could not load. Check the server logs, then retry."}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.assign("/overview")}>
          Open overview
        </Button>
      </div>
    </div>
  );
}
