import { ToolsClient } from "@/components/studio/tools-client";
import { PageHeader } from "@/components/ui-kit";
import { detectTools, hostInfo } from "@/lib/tools";
import { getExtensionViews } from "@/lib/extensions/manager";
import { detectHostDependencies } from "@/lib/extensions/dependencies";
import { getSettings } from "@/lib/settings";
import { decryptSecret } from "@/lib/secrets";
import { checkAgentHealth } from "@/lib/system";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tool Manager" };

export default async function ToolsPage() {
  const [tools, extensions, hostDependencies, settings] = await Promise.all([
    detectTools(),
    getExtensionViews(),
    detectHostDependencies(),
    getSettings(),
  ]);
  const agentHealth = await checkAgentHealth(settings.agent.url, decryptSecret(settings.agent.pairingToken));
  const visibleTools = tools.map((tool) =>
    agentHealth.ok && agentHealth.tools?.includes(tool.key)
      ? { ...tool, installed: true, health: "ok" as const, version: "Installed on Local Agent", path: settings.agent.url }
      : tool,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Tool Manager"
        description="Check the tools FREMIQ uses on this host and browse the optional Creative Extensions marketplace. Extensions are never mandatory: the core engine keeps working without them."
      />
      <ToolsClient
        initialTools={visibleTools}
        host={hostInfo()}
        initialExtensions={extensions}
        initialHostDependencies={hostDependencies}
        agentConnected={agentHealth.ok}
        webTranscriptionConfigured={Boolean(settings.ai.openaiApiKey)}
      />
    </div>
  );
}
