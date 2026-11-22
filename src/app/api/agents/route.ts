import { handleError, ok } from "@/lib/api";
import { syncAgents } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const probes = await syncAgents();
    return ok({
      agents: probes,
      connected: probes.filter((agent) => agent.status === "connected").length,
      installed: probes.filter((agent) => agent.installed).length,
    });
  } catch (error) {
    return handleError(error, 500);
  }
}
