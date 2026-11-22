"use client";

import * as React from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field } from "@/components/ui-kit";
import { apiFetch } from "@/lib/client-api";
import type { PublicSettings } from "@/lib/settings";

export function SettingsClient({ initialSettings }: { initialSettings: PublicSettings }) {
  const [settings, setSettings] = React.useState(initialSettings);
  const [githubToken, setGithubToken] = React.useState("");
  const [telegramToken, setTelegramToken] = React.useState("");
  const [openAiKey, setOpenAiKey] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function save(section: string, patch: Record<string, unknown>, clear: string[] = []) {
    setBusy(section);
    try {
      const data = await apiFetch<{ settings: PublicSettings }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ settings: patch, clear }),
      });
      setSettings(data.settings);
      setGithubToken("");
      setTelegramToken("");
      setOpenAiKey("");
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setBusy(null);
    }
  }

  const video = settings.video;
  const processing = settings.processing;
  const github = settings.github;
  const telegram = settings.telegram;
  const ai = settings.ai;

  return (
    <Tabs defaultValue="video" className="space-y-4">
      <TabsList className="h-9">
        <TabsTrigger value="video">Video defaults</TabsTrigger>
        <TabsTrigger value="processing">Render queue</TabsTrigger>
        <TabsTrigger value="ai">AI & transcription</TabsTrigger>
        <TabsTrigger value="integrations">Connections</TabsTrigger>
      </TabsList>

      <TabsContent value="video" className="space-y-4">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-4 p-4">
            <div>
              <h2 className="text-sm font-medium">New project format</h2>
              <p className="mt-1 text-xs text-muted-foreground">These defaults are used when you create a project. Existing projects keep their own format.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Aspect ratio">
                <Select
                  value={video.aspectRatio}
                  onValueChange={(aspectRatio) => {
                    const resolutions: Record<string, string> = {
                      "16:9": "1920x1080", "9:16": "1080x1920", "1:1": "1080x1080",
                      "4:5": "1080x1350", "4:3": "1440x1080", "21:9": "2520x1080",
                    };
                    setSettings((current) => ({ ...current, video: { ...current.video, aspectRatio, resolution: resolutions[aspectRatio] ?? current.video.resolution } }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["16:9", "9:16", "1:1", "4:5", "4:3", "21:9"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Resolution">
                <Input value={video.resolution} onChange={(event) => setSettings((current) => ({ ...current, video: { ...current.video, resolution: event.target.value } }))} />
              </Field>
              <Field label="Frame rate">
                <Select value={String(video.fps)} onValueChange={(value) => setSettings((current) => ({ ...current, video: { ...current.video, fps: Number(value) } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[24, 25, 30, 50, 60].map((fps) => <SelectItem key={fps} value={String(fps)}>{fps} fps</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Button onClick={() => save("video", { video })} disabled={busy !== null}>
              {busy === "video" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save video defaults
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="processing" className="space-y-4">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-4 p-4">
            <div>
              <h2 className="text-sm font-medium">Render queue</h2>
              <p className="mt-1 text-xs text-muted-foreground">Choose how many exports FREMIQ processes at once.</p>
            </div>
            <Field label="Parallel renders" hint="More renders use more CPU and memory. 1 is recommended for most computers.">
              <Select value={String(processing.maxConcurrency)} onValueChange={(value) => setSettings((current) => ({ ...current, processing: { ...current.processing, maxConcurrency: Number(value) } }))}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">1 at a time</SelectItem><SelectItem value="2">2 at a time</SelectItem></SelectContent>
              </Select>
            </Field>
            <Button onClick={() => save("processing", { processing })} disabled={busy !== null}>
              {busy === "processing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save queue settings
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ai" className="space-y-4">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Web transcription</h2>
              <Badge variant="outline" className="text-[10px]">{ai.hasApiKey ? "Provider connected" : "Setup required"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Add an OpenAI API key to transcribe captions through the web. FREMIQ sends extracted audio to this provider only when you press Transcribe. The provider may charge for usage. Keys are stored encrypted.
            </p>
            <Field label="API base URL" hint="OpenAI: https://api.openai.com/v1 · OpenAI-compatible transcription providers are supported.">
              <Input value={ai.openaiBaseUrl || "https://api.openai.com/v1"} onChange={(event) => setSettings((current) => ({ ...current, ai: { ...current.ai, openaiBaseUrl: event.target.value } }))} placeholder="https://api.openai.com/v1" />
            </Field>
            <Field label="API key" hint="Saved securely. Leave blank to keep the saved key.">
              <Input type="password" autoComplete="new-password" value={openAiKey} onChange={(event) => setOpenAiKey(event.target.value)} placeholder={ai.hasApiKey ? "Saved securely · enter a new key to replace" : "sk-…"} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save("ai", { ai: { openaiBaseUrl: ai.openaiBaseUrl || "https://api.openai.com/v1", ...(openAiKey.trim() ? { openaiApiKey: openAiKey.trim() } : {}) } })} disabled={busy !== null}>
                {busy === "ai" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save transcription settings
              </Button>
              {ai.hasApiKey ? <Button variant="outline" onClick={() => save("ai", { ai: { openaiBaseUrl: ai.openaiBaseUrl } }, ["ai.openaiApiKey"])} disabled={busy !== null}><Trash2 className="h-3.5 w-3.5" /> Remove API key</Button> : null}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="integrations" className="space-y-4">
        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">GitHub</h2>
              <Badge variant="outline" className="text-[10px]">{github.hasToken ? "Token saved" : "Optional"}</Badge>
            </div>
            <Field label="Personal access token" hint="Only needed to browse private repositories. Stored encrypted.">
              <Input type="password" autoComplete="new-password" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder={github.hasToken ? "Saved securely · enter a new token to replace" : "ghp_…"} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default branch"><Input value={github.defaultBranch} onChange={(event) => setSettings((current) => ({ ...current, github: { ...current.github, defaultBranch: event.target.value } }))} /></Field>
              <Field label="Clone folder"><Input value={github.cloneDir} onChange={(event) => setSettings((current) => ({ ...current, github: { ...current.github, cloneDir: event.target.value } }))} /></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save("github", { github: { defaultBranch: github.defaultBranch, cloneDir: github.cloneDir, ...(githubToken.trim() ? { token: githubToken.trim() } : {}) } })} disabled={busy !== null}>
                {busy === "github" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save GitHub settings
              </Button>
              {github.hasToken ? <Button variant="outline" onClick={() => save("github", { github: { defaultBranch: github.defaultBranch, cloneDir: github.cloneDir } }, ["github.token"])} disabled={busy !== null}><Trash2 className="h-3.5 w-3.5" /> Remove token</Button> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 hairline">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Telegram remote control</h2>
              <Badge variant="outline" className="text-[10px]">{telegram.hasBotToken ? "Token saved" : "Optional"}</Badge>
            </div>
            <Field label="Bot token" hint="Create a bot with BotFather. FREMIQ encrypts the token before saving it.">
              <Input type="password" autoComplete="new-password" value={telegramToken} onChange={(event) => setTelegramToken(event.target.value)} placeholder={telegram.hasBotToken ? "Saved securely · enter a new token to replace" : "123456:…"} />
            </Field>
            <Field label="Authorised user IDs" hint="Your numeric Telegram user ID(s). A private-chat ID is usually the same number; only these users may request edits.">
              <Input value={telegram.authorizedUserIds} onChange={(event) => setSettings((current) => ({ ...current, telegram: { ...current.telegram, authorizedUserIds: event.target.value } }))} placeholder="123456789" />
            </Field>
            <Field label="Allowed chat IDs" hint="Comma-separated private/group/channel IDs that may send commands or receive renders. Add a channel here before enabling auto-post.">
              <Input value={telegram.chatAllowlist} onChange={(event) => setSettings((current) => ({ ...current, telegram: { ...current.telegram, chatAllowlist: event.target.value } }))} placeholder="123456789" />
            </Field>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-xs"><Switch checked={telegram.enabled} onCheckedChange={(enabled) => setSettings((current) => ({ ...current, telegram: { ...current.telegram, enabled } }))} /> Enable Telegram</label>
              <label className="flex items-center gap-2 text-xs"><Switch checked={telegram.notifications} onCheckedChange={(notifications) => setSettings((current) => ({ ...current, telegram: { ...current.telegram, notifications } }))} /> Render notifications</label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save("telegram", { telegram: { authorizedUserIds: telegram.authorizedUserIds, chatAllowlist: telegram.chatAllowlist, enabled: telegram.enabled, notifications: telegram.notifications, ...(telegramToken.trim() ? { botToken: telegramToken.trim() } : {}) } })} disabled={busy !== null}>
                {busy === "telegram" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Telegram settings
              </Button>
              {telegram.hasBotToken ? <Button variant="outline" onClick={() => save("telegram", { telegram: { authorizedUserIds: telegram.authorizedUserIds, chatAllowlist: telegram.chatAllowlist, enabled: false, notifications: telegram.notifications } }, ["telegram.botToken"])} disabled={busy !== null}><Trash2 className="h-3.5 w-3.5" /> Remove token</Button> : null}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
