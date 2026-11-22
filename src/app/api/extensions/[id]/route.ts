import { handleError, ok, readJson } from "@/lib/api";
import { getExtensionView, saveExtensionConfig } from "@/lib/extensions/manager";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return ok({ extension: await getExtensionView(id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);
    const config = (body.config ?? body) as Record<string, unknown>;
    return ok({ extension: await saveExtensionConfig(id, config) });
  } catch (error) {
    return handleError(error);
  }
}
