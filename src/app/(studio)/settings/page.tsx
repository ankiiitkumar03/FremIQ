import { SettingsClient } from "@/components/studio/settings-client";
import { PageHeader } from "@/components/ui-kit";
import { getSettings, toPublicSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = toPublicSettings(await getSettings());
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Choose project video defaults, manage render speed, and configure optional connections. Secret tokens are stored encrypted."
      />
      <SettingsClient initialSettings={settings} />
    </div>
  );
}
