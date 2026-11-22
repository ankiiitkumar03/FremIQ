import { fail, handleError, ok, readJson } from "@/lib/api";
import {
  executeExtension,
  healthCheckExtension,
  installExtension,
  setExtensionEnabled,
  uninstallExtension,
  updateExtension,
} from "@/lib/extensions/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actions = [
  "install",
  "uninstall",
  "enable",
  "disable",
  "update",
  "health",
  "execute",
] as const;

type Action = (typeof actions)[number];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params;
    if (!actions.includes(action as Action)) {
      return fail(`Unsupported extension action: ${action}`, 404);
    }
    const body: Record<string, unknown> = await readJson<Record<string, unknown>>(request).catch(() => ({}));

    if (action === "install") {
      const result = await installExtension(id, {
        confirm: body.confirm === true,
        licenseAccepted: body.licenseAccepted === true,
      });
      return ok({ result, extension: await healthCheckExtension(id).catch(() => null) });
    }
    if (action === "uninstall") {
      if (body.confirm !== true) {
        return fail("Explicit confirmation is required before uninstalling", 400);
      }
      const result = await uninstallExtension(id);
      return ok({ result });
    }
    if (action === "update") {
      if (body.confirm !== true) {
        return fail("Explicit confirmation is required before updating", 400);
      }
      const result = await updateExtension(id);
      return ok({ result });
    }
    if (action === "enable" || action === "disable") {
      const extension = await setExtensionEnabled(id, action === "enable");
      return ok({ extension });
    }
    if (action === "health") {
      return ok({ extension: await healthCheckExtension(id) });
    }

    const payload =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : body;
    const result = await executeExtension(id, payload);
    return ok({ result });
  } catch (error) {
    return handleError(error);
  }
}
