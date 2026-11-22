import { TelegramClient } from "@/components/studio/telegram-client";
import { PageHeader } from "@/components/ui-kit";
import { getTelegramStatus } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const metadata = { title: "Telegram" };

export default async function TelegramPage() {
  const status = await getTelegramStatus();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automate"
        title="Telegram"
        description="Verify your bot, send test notifications to allowlisted chats and see exactly what the integration can do today."
      />
      <TelegramClient initialStatus={status} />
    </div>
  );
}
