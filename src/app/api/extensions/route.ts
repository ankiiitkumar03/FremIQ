import { handleError, ok } from "@/lib/api";
import { getExtensionViews } from "@/lib/extensions/manager";
import { detectHostDependencies } from "@/lib/extensions/dependencies";
import { extensionCategories } from "@/lib/extensions/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [extensions, host] = await Promise.all([
      getExtensionViews(),
      detectHostDependencies(),
    ]);
    return ok({
      extensions,
      host,
      categories: extensionCategories,
      summary: {
        total: extensions.length,
        installed: extensions.filter((item) => item.installed).length,
        operational: extensions.filter((item) => item.operational).length,
        enabled: extensions.filter((item) => item.enabled).length,
        planned: extensions.filter((item) => item.definition.verification === "planned").length,
      },
    });
  } catch (error) {
    return handleError(error, 500);
  }
}
