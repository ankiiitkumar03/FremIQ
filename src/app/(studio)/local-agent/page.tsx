import { LocalAgentClient } from "@/components/studio/local-agent-client";
import { PageHeader } from "@/components/ui-kit";
import { getExtensionViews } from "@/lib/extensions/manager";
import { detectTools } from "@/lib/tools";
import { getSettings } from "@/lib/settings";
import { decryptSecret } from "@/lib/secrets";
import { getSystemStatus, checkAgentHealth } from "@/lib/system";

export const dynamic = "force-dynamic";
export const metadata = { title: "Local Agent" };

export default async function LocalAgentPage() {
  const [settings, status, tools, extensionViews] = await Promise.all([
    getSettings(),
    getSystemStatus(),
    detectTools(),
    getExtensionViews(),
  ]);
  const token = decryptSecret(settings.agent.pairingToken);
  const health = await checkAgentHealth(settings.agent.url, token);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Local Agent"
        description="Connect a FREMIQ agent running on your computer to use its hardware, media tools, and local processing. The hosted engine remains available when no agent is paired."
      />
      <LocalAgentClient
        initial={{
          url: settings.agent.url,
          paired: Boolean(token),
          autoConnect: settings.agent.autoConnect,
          health,
        }}
        status={status}
        tools={tools}
        extensions={extensionViews.map((view) => ({
          id: view.definition.id,
          name: view.definition.name,
          installed: view.installed,
          enabled: view.enabled,
          health: view.health,
        }))}
      />
    </div>
  );
}
