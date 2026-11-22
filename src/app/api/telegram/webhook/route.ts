import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editingPlans, media, projects, subtitleTracks } from "@/lib/db/schema";
import { defaultSettings, getSettings } from "@/lib/settings";
import { decryptSecret } from "@/lib/secrets";
import { parseIdList, sendTelegramMessageToChat } from "@/lib/telegram";
import { importLocalVideoFile } from "@/lib/media/import";
import { importVideoFromUrl } from "@/lib/media/remote-import";
import { generatePlan } from "@/lib/planner";
import { defaultSubtitleStyle } from "@/lib/media/subtitles";
import { resolveDataPath } from "@/lib/storage";
import { checkAgentHealth } from "@/lib/system";
import { executePlan } from "@/lib/jobs/execute-plan";
import { logActivity } from "@/lib/data";
import { runFfmpeg } from "@/lib/media/ffmpeg";
import type { SubtitleCue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

type TelegramFile = { file_id: string; file_size?: number; file_name?: string; mime_type?: string };
type TelegramMessage = {
  chat?: { id: number | string };
  from?: { id: number | string };
  text?: string;
  caption?: string;
  video?: TelegramFile;
  document?: TelegramFile;
};
type TelegramUpdate = { update_id: number; message?: TelegramMessage };

const seenUpdates = new Map<number, number>();
const activeUpdates = new Set<number>();
const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

function webhookSecret(token: string) {
  return crypto.createHmac("sha256", token).update("fremiq-telegram-webhook-v1").digest("hex");
}

function validSecret(provided: string | null, expected: string) {
  if (!provided || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function telegramApi<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const data = (await response.json()) as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || data.ok === false) throw new Error(data.description ?? `Telegram ${method} failed`);
  return data.result as T;
}

async function getOrCreateProject() {
  const found = await db.select().from(projects).where(eq(projects.name, "Telegram Video Inbox")).orderBy(desc(projects.updatedAt)).limit(1);
  if (found[0]) return found[0];
  const created = await db.insert(projects).values({
    name: "Telegram Video Inbox",
    description: "Videos and edits requested through the FREMIQ Telegram bot.",
    aspectRatio: defaultSettings.video.aspectRatio,
    resolution: defaultSettings.video.resolution,
    frameRate: defaultSettings.video.fps,
  }).returning();
  return created[0];
}

async function transcribeSource(projectId: string, mediaId: string) {
  const settings = await getSettings();
  const rows = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  const source = rows[0];
  if (!source) throw new Error("Imported Telegram video is missing");
  const sourcePath = resolveDataPath(source.relativePath);
  const apiKey = decryptSecret(settings.ai.openaiApiKey);
  if (apiKey) {
    const tempPath = path.join(os.tmpdir(), `fremiq-telegram-transcription-${crypto.randomUUID()}.mp3`);
    try {
      const converted = await runFfmpeg(["-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", "-f", "mp3", tempPath], { timeoutMs: 15 * 60 * 1000 });
      if (converted.code !== 0 || !fs.existsSync(tempPath)) throw new Error("Could not extract audio for transcription");
      if (fs.statSync(tempPath).size > 25 * 1024 * 1024) throw new Error("Compressed audio exceeds the transcription provider's 25 MB limit");
      const baseUrl = (settings.ai.openaiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      const endpoint = new URL(`${baseUrl}/audio/transcriptions`);
      if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) throw new Error("Transcription provider URL must use HTTPS");
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(fs.readFileSync(tempPath))], { type: "audio/mpeg" }), `${path.parse(source.name).name}.mp3`);
      form.append("model", "whisper-1");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
      form.append("timestamp_granularities[]", "word");
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(15 * 60 * 1000) });
      if (!response.ok) throw new Error(`Transcription failed: ${(await response.text()).slice(0, 250)}`);
      const payload = (await response.json()) as { language?: string; segments?: Array<{ start: number; end: number; text: string }>; words?: Array<{ start: number; end: number; word: string }> };
      const words = payload.words ?? [];
      const cues = (payload.segments ?? []).map((segment) => ({
        id: crypto.randomUUID(), start: segment.start, end: segment.end, text: segment.text.trim(),
        words: words.filter((word) => word.start < segment.end && word.end > segment.start).map((word) => ({ text: word.word.trim(), start: word.start, end: word.end })),
      }));
      return await saveCues(projectId, source.id, payload.language ?? "en", cues);
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  }

  const token = decryptSecret(settings.agent.pairingToken);
  const health = await checkAgentHealth(settings.agent.url, token);
  if (!health.ok) throw new Error("Set up web Whisper in Settings or pair a Local Agent to add captions automatically");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(fs.readFileSync(sourcePath))], { type: source.mimeType }), source.name);
  form.append("model", settings.ai.transcriptionModel || "faster-whisper/base");
  form.append("language", "auto");
  const response = await fetch(`${settings.agent.url.replace(/\/$/, "")}/api/transcribe`, {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form, signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Local Agent transcription failed: ${(await response.text()).slice(0, 250)}`);
  const payload = (await response.json()) as { cues?: SubtitleCue[]; language?: string };
  return saveCues(projectId, source.id, payload.language ?? "en", payload.cues ?? []);
}

async function saveCues(projectId: string, mediaId: string, language: string, cues: SubtitleCue[]) {
  if (cues.length === 0) throw new Error("Transcription returned no caption cues");
  await db.insert(subtitleTracks).values({
    projectId, mediaId, name: "Telegram request · Captions", language, format: "srt",
    style: { ...defaultSubtitleStyle, preset: "karaoke", karaoke: true },
    cues: cues as unknown[], source: "telegram-whisper",
  });
  return true;
}

async function downloadTelegramVideo(token: string, file: TelegramFile) {
  if (file.file_size && file.file_size > TELEGRAM_MAX_DOWNLOAD_BYTES) {
    throw new Error("Telegram bot downloads are limited to 20 MB. Compress the video or send a shorter clip.");
  }
  const remote = await telegramApi<{ file_path?: string }>(token, "getFile", { file_id: file.file_id });
  if (!remote.file_path) throw new Error("Telegram did not return a downloadable file path");
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${remote.file_path}`, { signal: AbortSignal.timeout(120_000), cache: "no-store" });
  if (!response.ok) throw new Error("Could not download the video from Telegram");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > TELEGRAM_MAX_DOWNLOAD_BYTES) throw new Error("Telegram video exceeds the 20 MB Bot API download limit");
  const filename = path.basename(file.file_name || `telegram-${crypto.randomUUID()}.mp4`).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  const temporaryPath = path.join(os.tmpdir(), `fremiq-${crypto.randomUUID()}-${filename}`);
  fs.writeFileSync(temporaryPath, buffer);
  return { temporaryPath, filename, mimeType: file.mime_type || "video/mp4" };
}

function extractVideoUrl(text: string) {
  return text.match(/https?:\/\/[^\s<>]+/i)?.[0]?.replace(/[),.]+$/, "") ?? null;
}

async function processUpdate(update: TelegramUpdate, message: TelegramMessage, chatId: string, token: string) {
  const text = (message.caption ?? message.text ?? "").trim();
  if (/^\/(start|help)(?:\s|$)/i.test(message.text ?? "")) {
    await sendTelegramMessageToChat(chatId, "Send a video (up to 20 MB) with your edit request in its caption, e.g. ‘Make 3 vertical shorts with captions’. Or send a direct video file URL with the edit request. YouTube/watch/live links are not supported. I will render the edit and return the MP4 here.");
    return;
  }

  const videoFile = message.video ?? (message.document?.mime_type?.startsWith("video/") ? message.document : undefined);
  const url = !videoFile ? extractVideoUrl(text) : null;
  if (!videoFile && !url) {
    await sendTelegramMessageToChat(chatId, "Send a video with the edit instructions in its caption, or a direct downloadable video-file URL. Type /help for examples.");
    return;
  }

  const project = await getOrCreateProject();
  let imported: Awaited<ReturnType<typeof importVideoFromUrl>>["item"];
  if (videoFile) {
    await sendTelegramMessageToChat(chatId, "Video received. Importing it now…");
    const downloaded = await downloadTelegramVideo(token, videoFile);
    try {
      imported = (await importLocalVideoFile(downloaded.temporaryPath, project.id, downloaded.filename, downloaded.mimeType)).item;
    } finally {
      fs.rmSync(downloaded.temporaryPath, { force: true });
    }
  } else {
    await sendTelegramMessageToChat(chatId, "Video link received. Importing it now…");
    imported = (await importVideoFromUrl(url!, project.id)).item;
  }

  const prompt = text.replace(url ?? "", "").trim() || "Create three vertical 30-second highlight clips.";
  let hasSubtitles = false;
  const captionWarning: string[] = [];
  if (/\b(captions?|subtitles?|karaoke|word highlights?)\b/i.test(prompt)) {
    try {
      hasSubtitles = await transcribeSource(project.id, imported.id);
    } catch (error) {
      captionWarning.push(error instanceof Error ? error.message : "Captions could not be transcribed");
    }
  }
  const generated = generatePlan({ prompt, project, media: [imported], hasSubtitles, audioTracks: [] });
  generated.context.warnings.unshift(...captionWarning);
  const planRows = await db.insert(editingPlans).values({
    projectId: project.id,
    prompt,
    summary: generated.summary,
    engine: generated.context.engine,
    status: "approved",
    operations: generated.operations,
    context: generated.context as unknown as Record<string, unknown>,
  }).returning();
  const execution = await executePlan(planRows[0], project, { telegramChatId: chatId, source: "telegram" });
  await logActivity({ projectId: project.id, type: "telegram.edit.queued", message: `Queued Telegram edit for ${imported.name}`, meta: { updateId: update.update_id, planId: planRows[0].id, jobIds: execution.jobs.map((job) => job.id) } });
  const queued = execution.jobs.map((job) => job.name).join("\n• ");
  const warnings = [...generated.context.warnings, ...execution.warnings];
  const warningText = warnings.length ? `\n\nHeads-up: ${warnings.join(" ")}` : "";
  await sendTelegramMessageToChat(chatId, `Edit queued (${execution.jobs.length} render${execution.jobs.length === 1 ? "" : "s"}). I’ll send each finished video here.\n• ${queued}${warningText}`);
}

export async function POST(request: Request) {
  const settings = await getSettings();
  const token = decryptSecret(settings.telegram.botToken);
  if (!token || !settings.telegram.enabled) return Response.json({ ok: true });
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!validSecret(secret, webhookSecret(token))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 1024 * 1024) return Response.json({ error: "Update too large" }, { status: 413 });
  let update: TelegramUpdate;
  try {
    update = JSON.parse(raw) as TelegramUpdate;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Number.isSafeInteger(update.update_id) || !update.message?.chat || !update.message.from) return Response.json({ ok: true });
  const chatId = String(update.message.chat.id);
  const userId = String(update.message.from.id);
  const authorizedUsers = parseIdList(settings.telegram.authorizedUserIds);
  const allowedChats = parseIdList(settings.telegram.chatAllowlist);
  if (!authorizedUsers.includes(userId) || !allowedChats.includes(chatId)) return Response.json({ ok: true });
  if (seenUpdates.has(update.update_id) || activeUpdates.has(update.update_id)) return Response.json({ ok: true });
  const now = Date.now();
  for (const [id, timestamp] of seenUpdates) if (now - timestamp > 24 * 60 * 60 * 1000) seenUpdates.delete(id);
  seenUpdates.set(update.update_id, now);
  activeUpdates.add(update.update_id);
  after(async () => {
    try {
      await processUpdate(update, update.message!, chatId, token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Telegram video processing failed";
      console.error("[fremiq-telegram] update processing failed", update.update_id, message);
      try { await sendTelegramMessageToChat(chatId, `I couldn't finish that request: ${message}`); } catch { /* destination may have been removed */ }
    } finally {
      activeUpdates.delete(update.update_id);
    }
  });
  return Response.json({ ok: true });
}
