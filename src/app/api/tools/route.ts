import { handleError, ok } from "@/lib/api";
import { detectTools, hostInfo } from "@/lib/tools";
import { getSettings } from "@/lib/settings";
import { decryptSecret } from "@/lib/secrets";
import { checkAgentHealth } from "@/lib/system";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [detected, settings] = await Promise.all([detectTools(), getSettings()]);
    const agentHealth = await checkAgentHealth(settings.agent.url, decryptSecret(settings.agent.pairingToken));
    const tools = detected.map((tool) =>
      agentHealth.ok && agentHealth.tools?.includes(tool.key)
        ? { ...tool, installed: true, health: "ok" as const, version: "Installed on Local Agent", path: settings.agent.url }
        : tool,
    );
    const installed = tools.filter((tool) => tool.installed).length;
    return ok({
      tools,
      host: hostInfo(),
      agentConnected: agentHealth.ok,
      summary: {
        installed,
        total: tools.length,
        missingRequired: tools.filter((tool) => tool.required && !tool.installed).length,
      },
    });
  } catch (error) {
    return handleError(error, 500);
  }
}
