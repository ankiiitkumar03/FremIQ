"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Send, ShieldCheck, Smartphone, Webhook, Video, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Field, KeyValue, StatusBadge } from "@/components/ui-kit";
import { apiFetch, postJson } from "@/lib/client-api";

type TelegramStatus = {
  configured: boolean;
  connected: boolean;
  botUsername: string | null;
  botName: string | null;
  authorizedUsers: string[];
  chatAllowlist: string[];
  notifications: boolean;
  enabled: boolean;
  message: string;
  webhookBaseUrl: string;
  webhookUrl: string | null;
  webhookLastError: string | null;
  autoPostEnabled: boolean;
  autoPostChatId: string;
};

export function TelegramClient({ initialStatus }: { initialStatus: TelegramStatus }) {
  const [status, setStatus] = React.useState(initialStatus);
  const [message, setMessage] = React.useState(
    "FREMIQ remote control is connected. This is a test message.",
  );
  const [busy, setBusy] = React.useState<"refresh" | "send" | null>(null);
  const [delivered, setDelivered] = React.useState<number | null>(null);
  const [webhookBaseUrl, setWebhookBaseUrl] = React.useState(initialStatus.webhookBaseUrl);
  const [autoPostEnabled, setAutoPostEnabled] = React.useState(initialStatus.autoPostEnabled);
  const [autoPostChatId, setAutoPostChatId] = React.useState(initialStatus.autoPostChatId);
  const [workflowBusy, setWorkflowBusy] = React.useState<"webhook" | "post" | null>(null);
  const [channelCheck, setChannelCheck] = React.useState<{ ok: boolean; message: string } | null>(null);

  React.useEffect(() => {
    if (!webhookBaseUrl && window.location.protocol === "https:") setWebhookBaseUrl(window.location.origin);
  }, [webhookBaseUrl]);

  async function refresh() {
    setBusy("refresh");
    try {
      const data = await apiFetch<TelegramStatus>("/api/telegram/status");
      setStatus(data);
      toast.success("Telegram status refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh Telegram");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    try {
      const data = await postJson<{ delivered: number }>("/api/telegram/test", { text: message });
      setDelivered(data.delivered);
      toast.success(`Message delivered to ${data.delivered} chat${data.delivered === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the message");
    } finally {
      setBusy(null);
    }
  }

  async function manageWebhook(action: "register" | "remove") {
    setWorkflowBusy("webhook");
    try {
      await postJson("/api/telegram/webhook/manage", { action, url: webhookBaseUrl });
      const data = await apiFetch<TelegramStatus>("/api/telegram/status");
      setStatus(data);
      setWebhookBaseUrl(data.webhookBaseUrl);
      toast.success(action === "register" ? "Telegram video webhook registered" : "Telegram webhook removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update Telegram webhook");
    } finally {
      setWorkflowBusy(null);
    }
  }

  async function saveAutoPost() {
    if (autoPostEnabled && !channelCheck?.ok) {
      toast.error("Check the bot's posting access before enabling auto-post");
      return;
    }
    if (autoPostEnabled && !status.autoPostEnabled && !window.confirm("Future FREMIQ renders will be published automatically to this Telegram channel. Continue?")) return;
    setWorkflowBusy("post");
    try {
      const data = await apiFetch<{ settings: { telegram: { autoPostEnabled: boolean; autoPostChatId: string } } }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ settings: { telegram: { autoPostEnabled, autoPostChatId: autoPostChatId.trim() } } }),
      });
      setAutoPostEnabled(data.settings.telegram.autoPostEnabled);
      setAutoPostChatId(data.settings.telegram.autoPostChatId);
      setStatus((current) => ({ ...current, autoPostEnabled: data.settings.telegram.autoPostEnabled, autoPostChatId: data.settings.telegram.autoPostChatId }));
      toast.success("Telegram auto-post settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save auto-post settings");
    } finally {
      setWorkflowBusy(null);
    }
  }

  async function checkChannel() {
    setWorkflowBusy("post");
    setChannelCheck(null);
    try {
      const data = await postJson<{ ok: boolean; message: string }>("/api/telegram/channel", { chatId: autoPostChatId.trim() });
      setChannelCheck(data);
      if (data.ok) toast.success("Bot can publish to this channel");
      else toast.error(data.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not check channel access";
      setChannelCheck({ ok: false, message });
      toast.error(message);
    } finally {
      setWorkflowBusy(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Smartphone className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Bot connection</h3>
              <StatusBadge
                status={status.connected ? "connected" : status.configured ? "error" : "not_installed"}
                label={status.connected ? "Verified" : status.configured ? "Token rejected" : "Not configured"}
                className="ml-auto"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={refresh}
                disabled={busy === "refresh"}
                aria-label="Refresh Telegram status"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{status.message}</p>
            <div className="rounded-lg border border-border/70 bg-surface/40 p-3">
              <KeyValue label="Bot" value={status.botUsername ? `@${status.botUsername}` : "—"} />
              <KeyValue label="Name" value={status.botName ?? "—"} />
              <KeyValue label="Notifications" value={status.notifications ? "On" : "Off"} />
              <KeyValue label="Enabled" value={status.enabled ? "Yes" : "No"} />
              <KeyValue
                label="Authorised users"
                value={status.authorizedUsers.length ? status.authorizedUsers.join(", ") : "None"}
              />
              <KeyValue
                label="Chat allowlist"
                value={status.chatAllowlist.length ? status.chatAllowlist.join(", ") : "None"}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Configure in Settings</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={refresh} disabled={busy === "refresh"}>
                Re-check token
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Send a test message</h3>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              FREMIQ sends to every chat ID in the allowlist. Messages are delivered through the
              Telegram Bot API using your encrypted token.
            </p>
            <Field label="Message">
              <Input value={message} onChange={(event) => setMessage(event.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {status.chatAllowlist.length
                  ? `${status.chatAllowlist.length} chat${status.chatAllowlist.length === 1 ? "" : "s"} allowlisted`
                  : "Add a chat ID in Settings before sending."}
              </span>
              <Button
                size="sm"
                onClick={send}
                disabled={busy !== null || !status.connected || !message.trim() || status.chatAllowlist.length === 0}
              >
                {busy === "send" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                Send test
              </Button>
            </div>
            {delivered !== null ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Delivered to {delivered} chat{delivered === 1 ? "" : "s"}.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Webhook className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-medium">Video-in, edit-out automation</h3>
              <StatusBadge status={status.webhookUrl ? "ok" : "missing"} label={status.webhookUrl ? "Webhook active" : "Setup required"} className="ml-auto" />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Set a public HTTPS URL for this FREMIQ deployment. Then send the bot a video up to 20 MB with your edit request in the caption. The finished MP4 comes back in that same chat and the render is listed in Render Queue.
            </p>
            <Field label="Public FREMIQ HTTPS URL" hint="Telegram cannot reach localhost. Use this site’s public HTTPS address with a valid certificate.">
              <Input value={webhookBaseUrl} onChange={(event) => setWebhookBaseUrl(event.target.value)} placeholder="https://your-fremiq-domain.example" />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => manageWebhook("register")} disabled={workflowBusy !== null || !status.connected || !status.enabled || !webhookBaseUrl.trim()}>
                {workflowBusy === "webhook" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Webhook className="mr-1.5 h-3.5 w-3.5" />}
                Register webhook
              </Button>
              {status.webhookUrl ? <Button variant="outline" size="sm" onClick={() => manageWebhook("remove")} disabled={workflowBusy !== null}>Remove webhook</Button> : null}
            </div>
            {status.webhookLastError ? <p className="text-[10px] text-amber-300">Telegram webhook error: {status.webhookLastError}</p> : null}
            <p className="text-[10px] leading-relaxed text-muted-foreground">Only authorised user IDs in allowed chats can start edits. Direct video-file links work; YouTube watch/live links are rejected.</p>
              <Button asChild size="sm" variant="outline"><Link href="/render-queue">Open Render Queue</Link></Button>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2"><Upload className="h-4 w-4 text-brand" /><h3 className="text-sm font-medium">Optional auto-post to a Telegram channel</h3></div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">When enabled, future FREMIQ renders are automatically published to this channel. Add the channel to Allowed chat IDs in Settings and make the bot an administrator allowed to post.</p>
            <Field label="Channel ID or @username"><Input value={autoPostChatId} onChange={(event) => { setAutoPostChatId(event.target.value); setChannelCheck(null); }} placeholder="@my_video_channel" /></Field>
            <Button size="sm" variant="outline" onClick={checkChannel} disabled={workflowBusy !== null || !autoPostChatId.trim()}>
              {workflowBusy === "post" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />} Check bot posting access
            </Button>
            {channelCheck ? <p className={`text-[10px] ${channelCheck.ok ? "text-emerald-300" : "text-amber-300"}`}>{channelCheck.message}</p> : null}
            <label className="flex items-center gap-2 text-xs"><Switch checked={autoPostEnabled} onCheckedChange={setAutoPostEnabled} /> Automatically publish future renders</label>
            <Button size="sm" variant="outline" onClick={saveAutoPost} disabled={workflowBusy !== null || (autoPostEnabled && !autoPostChatId.trim())}>
              {workflowBusy === "post" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Video className="mr-1.5 h-3.5 w-3.5" />} Save auto-post setup
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit border-border/80 bg-card/60 hairline">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">Remote control</h3>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Incoming video edits use the secure Telegram webhook. Telegram needs a public HTTPS URL so it can reach this FREMIQ deployment.
          </p>
          <div className="rounded-lg border border-border/70 bg-surface/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">
                Outbound ready
              </Badge>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">
                Video edits
              </Badge>
            </div>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Never share your bot token. FREMIQ stores it encrypted and only shows whether one exists.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
