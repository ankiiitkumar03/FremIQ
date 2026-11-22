import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getSettings } from "@/lib/settings";
import { decryptSecret } from "@/lib/secrets";

export function parseIdList(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function telegramApi<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const data = (await response.json()) as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.description ?? `Telegram API ${method} failed`);
  }
  return data.result as T;
}

export async function getTelegramStatus() {
  const settings = await getSettings();
  const token = decryptSecret(settings.telegram.botToken);
  const authorizedUsers = parseIdList(settings.telegram.authorizedUserIds);
  const chatAllowlist = parseIdList(settings.telegram.chatAllowlist);
  if (!token) {
    return {
      configured: false,
      connected: false,
      botUsername: null as string | null,
      botName: null as string | null,
      authorizedUsers,
      chatAllowlist,
      notifications: settings.telegram.notifications,
      enabled: settings.telegram.enabled,
      webhookBaseUrl: settings.telegram.webhookBaseUrl,
      webhookUrl: null as string | null,
      webhookLastError: null as string | null,
      autoPostEnabled: settings.telegram.autoPostEnabled,
      autoPostChatId: settings.telegram.autoPostChatId,
      message: "Add a Telegram bot token in Settings to verify the bot.",
    };
  }
  try {
    const me = await telegramApi<{ username?: string; first_name?: string }>(token, "getMe");
    let webhook: { url?: string; last_error_message?: string } | null = null;
    let webhookLastError: string | null = null;
    try {
      webhook = await telegramApi<{ url?: string; last_error_message?: string }>(token, "getWebhookInfo");
      webhookLastError = webhook.last_error_message ?? null;
    } catch (error) {
      webhookLastError = error instanceof Error ? error.message : "Could not read webhook status";
    }
    return {
      configured: true,
      connected: true,
      botUsername: me.username ?? null,
      botName: me.first_name ?? null,
      authorizedUsers,
      chatAllowlist,
      notifications: settings.telegram.notifications,
      enabled: settings.telegram.enabled,
      webhookBaseUrl: settings.telegram.webhookBaseUrl,
      webhookUrl: webhook?.url || null,
      webhookLastError,
      autoPostEnabled: settings.telegram.autoPostEnabled,
      autoPostChatId: settings.telegram.autoPostChatId,
      message: "Bot token verified with Telegram getMe.",
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      botUsername: null as string | null,
      botName: null as string | null,
      authorizedUsers,
      chatAllowlist,
      notifications: settings.telegram.notifications,
      enabled: settings.telegram.enabled,
      webhookBaseUrl: settings.telegram.webhookBaseUrl,
      webhookUrl: null as string | null,
      webhookLastError: null as string | null,
      autoPostEnabled: settings.telegram.autoPostEnabled,
      autoPostChatId: settings.telegram.autoPostChatId,
      message: error instanceof Error ? error.message : "Telegram verification failed",
    };
  }
}

function webhookSecret(token: string) {
  return crypto.createHmac("sha256", token).update("fremiq-telegram-webhook-v1").digest("hex");
}

export async function registerTelegramWebhook(baseUrl: string) {
  const settings = await getSettings();
  const token = decryptSecret(settings.telegram.botToken);
  if (!token) throw new Error("Save a Telegram bot token in Settings first");
  if (!settings.telegram.enabled) throw new Error("Enable Telegram in Settings before registering the webhook");
  if (!parseIdList(settings.telegram.authorizedUserIds).length || !parseIdList(settings.telegram.chatAllowlist).length) {
    throw new Error("Add at least one authorised user ID and allowed chat ID in Settings first");
  }
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Webhook base URL must be a public HTTPS URL without credentials, query or fragment");
  }
  if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost") || parsed.hostname === "127.0.0.1") {
    throw new Error("Telegram cannot reach localhost. Use your public HTTPS FREMIQ URL");
  }
  const endpoint = `${normalized}/api/telegram/webhook`;
  await telegramApi(token, "setWebhook", {
    url: endpoint,
    secret_token: webhookSecret(token),
    allowed_updates: ["message"],
    max_connections: 4,
  });
  return endpoint;
}

export async function removeTelegramWebhook() {
  const settings = await getSettings();
  const token = decryptSecret(settings.telegram.botToken);
  if (!token) throw new Error("Telegram bot token is not configured");
  await telegramApi(token, "deleteWebhook", { drop_pending_updates: false });
}

export async function checkTelegramChannelAccess(chatId: string) {
  const settings = await getSettings();
  const token = decryptSecret(settings.telegram.botToken);
  if (!token) throw new Error("Telegram bot token is not configured");
  const destination = chatId.trim();
  if (!destination || !parseIdList(settings.telegram.chatAllowlist).includes(destination)) {
    throw new Error("Add this channel ID or @username to Allowed chat IDs in Settings first");
  }
  const bot = await telegramApi<{ id: number }>(token, "getMe");
  const member = await telegramApi<{ status?: string; can_post_messages?: boolean }>(token, "getChatMember", { chat_id: destination, user_id: bot.id });
  const canPost = (member.status === "administrator" || member.status === "creator") && member.can_post_messages !== false;
  return {
    ok: canPost,
    message: canPost
      ? "Bot can post to this Telegram channel."
      : "Add the bot as a channel administrator and allow it to post messages.",
  };
}

export async function sendTelegramMessage(text: string) {
  const settings = await getSettings();
  const token = decryptSecret(settings.telegram.botToken);
  if (!token) throw new Error("Telegram bot token is not configured");
  const chats = parseIdList(settings.telegram.chatAllowlist);
  if (chats.length === 0) {
    throw new Error("Add at least one chat ID to the Telegram allowlist");
  }
  const results: Array<{ chatId: string; ok: boolean; error?: string }> = [];
  for (const chatId of chats) {
    try {
      await telegramApi(token, "sendMessage", { chat_id: chatId, text });
      results.push({ chatId, ok: true });
    } catch (error) {
      results.push({
        chatId,
        ok: false,
        error: error instanceof Error ? error.message : "send failed",
      });
    }
  }
  return results;
}

export async function sendTelegramMessageToChat(chatId: string, text: string) {
  const settings = await getSettings();
  const token = decryptSecret(settings.telegram.botToken);
  if (!token) throw new Error("Telegram bot token is not configured");
  if (!settings.telegram.enabled) throw new Error("Telegram integration is disabled in Settings");
  if (!parseIdList(settings.telegram.chatAllowlist).includes(chatId)) {
    throw new Error("This Telegram chat is no longer in the allowed chat list");
  }
  await telegramApi(token, "sendMessage", { chat_id: chatId, text });
}

export async function sendTelegramVideo(chatId: string, filePath: string, caption: string) {
  const settings = await getSettings();
  const token = decryptSecret(settings.telegram.botToken);
  if (!token) throw new Error("Telegram bot token is not configured");
  if (!settings.telegram.enabled) throw new Error("Telegram integration is disabled in Settings");
  const allowed = parseIdList(settings.telegram.chatAllowlist);
  if (!allowed.includes(chatId) && chatId !== settings.telegram.autoPostChatId) {
    throw new Error("This Telegram destination is no longer configured");
  }
  const stat = fs.statSync(filePath);
  if (stat.size > 50 * 1024 * 1024) throw new Error("Telegram Bot API accepts video uploads up to 50 MB. Download the render from FREMIQ instead.");
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption.slice(0, 1000));
  form.append("supports_streaming", "true");
  form.append("video", new Blob([new Uint8Array(fs.readFileSync(filePath))], { type: "video/mp4" }), path.basename(filePath));
  const response = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const data = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || data.ok === false) throw new Error(data.description ?? "Telegram video delivery failed");
}
