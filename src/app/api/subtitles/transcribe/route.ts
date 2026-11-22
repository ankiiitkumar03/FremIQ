import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, subtitleTracks } from "@/lib/db/schema";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { getProjectById, logActivity } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { decryptSecret } from "@/lib/secrets";
import { resolveDataPath } from "@/lib/storage";
import { checkAgentHealth } from "@/lib/system";
import { defaultSubtitleStyle } from "@/lib/media/subtitles";
import { runFfmpeg } from "@/lib/media/ffmpeg";
import type { SubtitleCue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function transcribeWithAgent(input: {
  url: string;
  token: string;
  path: string;
  name: string;
  model: string;
  language: string;
}) {
  const audioPath = path.join(os.tmpdir(), "fremiq-local-transcription-" + randomUUID() + ".mp3");
  try {
    const converted = await runFfmpeg(
      ["-i", input.path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", "-f", "mp3", audioPath],
      { timeoutMs: 60 * 60 * 1000 },
    );
    if (converted.code !== 0 || !fs.existsSync(audioPath)) {
      throw new Error("Could not extract audio for local transcription: " + converted.stderr.slice(-300));
    }
    const audioName = input.name.replace(/\.[^.]+$/, "") + ".mp3";
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(fs.readFileSync(audioPath))], { type: "audio/mpeg" }), audioName);
    form.append("model", input.model);
    form.append("language", input.language);
    const response = await fetch(input.url.replace(/\/$/, "") + "/api/transcribe", {
      method: "POST",
      headers: input.token ? { Authorization: "Bearer " + input.token } : undefined,
      body: form,
      signal: AbortSignal.timeout(60 * 60 * 1000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error("Local Agent transcription failed: " + detail);
    }
    return (await response.json()) as { cues?: SubtitleCue[]; language?: string; model?: string };
  } finally {
    fs.rmSync(audioPath, { force: true });
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.projectId !== "string" || !body.projectId) {
      return fail("projectId is required", 400);
    }
    if (typeof body.mediaId !== "string" || !body.mediaId) {
      return fail("mediaId is required", 400);
    }
    const project = await getProjectById(body.projectId);
    if (!project) return fail("Project not found", 404);
    const rows = await db.select().from(media).where(eq(media.id, body.mediaId)).limit(1);
    const source = rows[0];
    if (!source || source.projectId !== project.id) return fail("Media not found in this project", 404);

    const settings = await getSettings();
    const absolutePath = resolveDataPath(source.relativePath);
    if (!fs.existsSync(absolutePath)) return fail("Media file is missing on disk", 404);
    const apiKey = decryptSecret(settings.ai.openaiApiKey);
    let result: { cues?: SubtitleCue[]; language?: string; model?: string } = {};

    if (apiKey) {
      const baseUrl = (settings.ai.openaiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      let endpoint: URL;
      try {
        endpoint = new URL(`${baseUrl}/audio/transcriptions`);
      } catch {
        return fail("Transcription API URL is invalid. Check Settings → AI & transcription.", 400);
      }
      if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
        return fail("Transcription API URL must use HTTPS (localhost is allowed for local providers).", 400);
      }

      const tempPath = path.join(os.tmpdir(), `fremiq-transcription-${randomUUID()}.mp3`);
      try {
        const converted = await runFfmpeg(["-i", absolutePath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", "-f", "mp3", tempPath], { timeoutMs: 15 * 60 * 1000 });
        if (converted.code !== 0 || !fs.existsSync(tempPath)) {
          return fail(`Could not extract audio for web transcription: ${converted.stderr.slice(-300)}`, 422);
        }
        if (fs.statSync(tempPath).size > 25 * 1024 * 1024) {
          return fail("Compressed audio is over the provider's 25 MB limit. Import a shorter clip or SRT/VTT captions.", 413);
        }
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(fs.readFileSync(tempPath))], { type: "audio/mpeg" }), `${path.parse(source.name).name}.mp3`);
        form.append("model", "whisper-1");
        form.append("response_format", "verbose_json");
        form.append("timestamp_granularities[]", "segment");
        form.append("timestamp_granularities[]", "word");
        if (typeof body.language === "string" && body.language !== "auto") form.append("language", body.language);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(15 * 60 * 1000),
        });
        if (!response.ok) {
          const text = await response.text();
          let errorCode = "";
          try {
            const payload = JSON.parse(text) as { error?: { code?: string; type?: string } };
            errorCode = payload.error?.code ?? payload.error?.type ?? "";
          } catch {
            // Some compatible providers return plain text errors.
          }
          if (
            errorCode === "insufficient_quota" ||
            errorCode === "credit_balance_exhausted" ||
            /no credits remaining|insufficient quota/i.test(text)
          ) {
            const token = decryptSecret(settings.agent.pairingToken);
            const health = await checkAgentHealth(settings.agent.url, token);
            if (!health.ok) {
              return fail(
                "OpenAI transcription credits are exhausted. Add credits in OpenAI Billing, or pair a Local Agent with Faster-Whisper for local transcription.",
                402,
                { requiresAgent: true, agentError: health.error, billingUrl: "https://platform.openai.com/settings/organization/billing/" },
              );
            }
            try {
              result = await transcribeWithAgent({
                url: settings.agent.url,
                token,
                path: absolutePath,
                name: source.name,
                model: settings.ai.transcriptionModel || "faster-whisper/base",
                language: typeof body.language === "string" ? body.language : "auto",
              });
            } catch (agentError) {
              return fail(
                "OpenAI credits are exhausted and local fallback failed: " +
                  (agentError instanceof Error ? agentError.message : "unknown Local Agent error"),
                502,
                { requiresAgent: true, billingUrl: "https://platform.openai.com/settings/organization/billing/" },
              );
            }
          } else {
            return fail(`Web transcription failed: ${text.slice(0, 300)}`, response.status === 413 ? 413 : 502);
          }
        }
        if (response.ok) {
        const payload = (await response.json()) as {
          language?: string;
          text?: string;
          segments?: Array<{ start: number; end: number; text: string }>;
          words?: Array<{ start: number; end: number; word: string }>;
        };
        const words = payload.words ?? [];
        result = {
          language: payload.language,
          model: "whisper-1 (web)",
          cues: (payload.segments ?? []).map((segment) => ({
            id: randomUUID(),
            start: segment.start,
            end: segment.end,
            text: segment.text.trim(),
            words: words.filter((word) => word.start < segment.end && word.end > segment.start).map((word) => ({ text: word.word.trim(), start: word.start, end: word.end })),
          })),
        };
        }
      } finally {
        fs.rmSync(tempPath, { force: true });
      }
    } else {
      const token = decryptSecret(settings.agent.pairingToken);
      const health = await checkAgentHealth(settings.agent.url, token);
      if (!health.ok) {
        return fail(
          "Set up web transcription in Settings → AI & transcription, or connect the optional FREMIQ Local Agent. You can also import an SRT/VTT file.",
          503,
          { requiresAgent: true, agentError: health.error },
        );
      }

      try {
        result = await transcribeWithAgent({
          url: settings.agent.url,
          token,
          path: absolutePath,
          name: source.name,
          model: settings.ai.transcriptionModel || "faster-whisper/base",
          language: typeof body.language === "string" ? body.language : "auto",
        });
      } catch (agentError) {
        return fail(
          agentError instanceof Error ? agentError.message : "Local Agent transcription failed",
          502,
        );
      }
    }
    const cues = result.cues ?? [];
    if (cues.length === 0) return fail("The agent returned no subtitle cues", 502);

    const inserted = await db
      .insert(subtitleTracks)
      .values({
        projectId: project.id,
        mediaId: source.id,
        name: `${source.name.replace(/\.[^.]+$/, "")} · Whisper`,
        language: result.language ?? "en",
        format: "srt",
        style: { ...defaultSubtitleStyle, preset: "karaoke", karaoke: true },
        cues: cues as unknown[],
        source: "whisper",
      })
      .returning();

    await logActivity({
      projectId: project.id,
      type: "subtitles.transcribed",
      message: `Transcribed “${source.name}” with ${result.model ?? "Whisper"}`,
      meta: { subtitleId: inserted[0].id, cues: cues.length },
    });

    return ok({ track: inserted[0], model: result.model ?? null }, 201);
  } catch (error) {
    return handleError(error);
  }
}
