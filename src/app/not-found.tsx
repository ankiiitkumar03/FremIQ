import Link from "next/link";
import { BrandMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 text-center">
      <BrandMark size={44} />
      <div>
        <h1 className="text-xl font-semibold">That screen does not exist</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          The page may have moved. Return to the overview to continue working in your
          workspace.
        </p>
      </div>
      <Button asChild>
        <Link href="/overview">Back to overview</Link>
      </Button>
    </div>
  );
}
