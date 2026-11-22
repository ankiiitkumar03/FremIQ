"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client-api";

export function OpenProjectButton({
  projectId,
  href = "/ai-editor",
  label = "Open",
  variant = "outline",
  size = "sm",
}: {
  projectId: string;
  href?: string;
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await postJson("/api/active-project", { projectId });
          router.push(href);
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not open the project");
          setPending(false);
        }
      }}
    >
      {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
      {label}
    </Button>
  );
}
