import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const DATA_ROOT =
  process.env.FREMIQ_DATA_DIR ?? path.join(process.cwd(), ".data");

export const dirs = {
  root: DATA_ROOT,
  media: path.join(DATA_ROOT, "media"),
  exports: path.join(DATA_ROOT, "exports"),
  thumbs: path.join(DATA_ROOT, "thumbs"),
  workspace: path.join(DATA_ROOT, "workspace"),
  temp: path.join(DATA_ROOT, "temp"),
  uploads: path.join(DATA_ROOT, "uploads"),
};

export function ensureDirs() {
  for (const dir of Object.values(dirs)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function resolveDataPath(relativePath: string) {
  const normalized = path.normalize(relativePath).replace(/^([/\\])+/, "");
  const absolute = path.resolve(/* turbopackIgnore: true */ DATA_ROOT, normalized);
  if (
    !absolute.startsWith(path.resolve(/* turbopackIgnore: true */ DATA_ROOT) + path.sep) &&
    absolute !== path.resolve(/* turbopackIgnore: true */ DATA_ROOT)
  ) {
    throw new Error("Path traversal blocked");
  }
  return absolute;
}

export function toRelative(absolutePath: string) {
  return path.relative(DATA_ROOT, absolutePath).split(path.sep).join("/");
}

export function safeFileName(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ()]/g, "_").trim();
  return base.slice(0, 120) || "file";
}

export function uniqueName(name: string) {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  return `${stem}-${crypto.randomBytes(4).toString("hex")}${ext}`;
}

export function extensionForMime(mime: string) {
  const map: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-matroska": ".mkv",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/zip": ".zip",
  };
  return map[mime] ?? "";
}

export function mimeForExtension(ext: string) {
  const map: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".srt": "text/plain",
    ".vtt": "text/vtt",
    ".ass": "text/plain",
    ".zip": "application/zip",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

export function isMediaExtension(name: string) {
  return /\.(mp4|mov|webm|mkv|avi|m4v|mp3|wav|m4a|aac|flac|ogg|png|jpg|jpeg|webp|gif)$/i.test(
    name,
  );
}

export function diskStats() {
  try {
    const stats = fs.statfsSync(DATA_ROOT);
    return {
      free: Number(stats.bavail) * Number(stats.bsize),
      total: Number(stats.blocks) * Number(stats.bsize),
    };
  } catch {
    return { free: null, total: null };
  }
}
