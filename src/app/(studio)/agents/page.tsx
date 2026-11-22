import { AgentsClient } from "@/components/studio/agents-client";
import { PageHeader } from "@/components/ui-kit";
import { syncAgents } from "@/lib/agents";
import { getExtensionViews } from "@/lib/extensions/manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Agents" };

export default async function AgentsPage() {
  const [agents, extensions] = await Promise.all([syncAgents(), getExtensionViews()]);
  const skills = extensions
    .filter((view) => view.definition.skill)
    .map((view) => ({
      id: view.definition.id,
      name: view.definition.name,
      installed: view.installed,
      operational: view.operational,
      tagline: view.definition.tagline,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automate"
        title="AI Agents"
        description="Detect coding agents already installed on this machine, point FREMIQ at a custom binary, and see which optional extension skills are available to them."
      />
      <AgentsClient initialAgents={agents} skills={skills} />
    </div>
  );
}
