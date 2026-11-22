import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { mimeForExtension, safeFileName } from "@/lib/storage";

export function ok<T>(data: T, status = 200) {
  return Response.json(data as unknown as Record<string, unknown>, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status });
}

export function handleError(error: unknown, fallbackStatus = 500) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status =
    /not found/i.test(message)
      ? 404
      : /already|missing|approve|required|invalid|exceeds|blocked/i.test(message)
        ? 400
        : fallbackStatus;
  if (status >= 500) {
    console.error("[fremiq] API request failed", error);
    return fail(process.env.NODE_ENV === "production" ? "Internal server error" : message, status);
  }
  return fail(message, status);
}

const MAX_JSON_BODY_BYTES = 16 * 1024 * 1024;

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new Error("Request body exceeds the 16 MB limit");
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BODY_BYTES) {
    throw new Error("Request body exceeds the 16 MB limit");
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function numberField(value: unknown, field: string, fallback?: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${field} must be a number`);
  }
  return parsed;
}

export function streamFile(
  request: Request,
  absolutePath: string,
  options: { downloadName?: string; inline?: boolean } = {},
) {
  if (!fs.existsSync(absolutePath)) {
    return fail("File not found on disk", 404);
  }
  const stat = fs.statSync(absolutePath);
  const mime = mimeForExtension(path.extname(absolutePath));
  const filename = safeFileName(options.downloadName ?? path.basename(absolutePath));
  const disposition = `${options.inline ? "inline" : "attachment"}; filename="${filename}"`;
  const range = request.headers.get("range");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = match?.[1] ? Number(match[1]) : 0;
    let end = match?.[2] ? Number(match[2]) : stat.size - 1;
    if (match && !match[1] && match[2]) {
      const suffixLength = Number(match[2]);
      start = suffixLength > 0 ? Math.max(0, stat.size - suffixLength) : stat.size;
      end = stat.size - 1;
    }
    if (!match || stat.size === 0 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stat.size || end < start) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    end = Math.min(end, stat.size - 1);
    const stream = fs.createReadStream(absolutePath, { start, end });
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const stream = fs.createReadStream(absolutePath);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=60",
    },
  });
}
