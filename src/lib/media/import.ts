import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, type MediaItem } from "@/lib/db/schema";
import {
  dirs,
  extensionForMime,
  isMediaExtension,
  mimeForExtension,
  resolveDataPath,
  safeFileName,
  toRelative,
  uniqueName,
} from "@/lib/storage";
import { runFfmpeg } from "./ffmpeg";
import { probeMedia } from "./probe";
import { logActivity } from "@/lib/data";

const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 500;
const MAX_ZIP_UNCOMPRESSED = 2 * 1024 * 1024 * 1024;
const MAX_IMPORTED_FROM_ZIP = 40;

function kindFromProbe(kind: string, mime: string, name: string) {
  if (/\.zip$/i.test(name) || mime === "application/zip") return "archive" as const;
  if (kind === "video" || kind === "audio" || kind === "image") return kind;
  return "other" as const;
}

export async function makeThumbnail(absolutePath: string, kind: string, id: string) {
  if (!["video", "audio", "image"].includes(kind)) return null;
  const target = path.join(dirs.thumbs, `${id}.jpg`);
  fs.mkdirSync(dirs.thumbs, { recursive: true });
  const args =
    kind === "audio"
      ? [
          "-i",
          absolutePath,
          "-filter_complex",
          "showwavespic=s=640x360:colors=#A78BFA",
          "-frames:v",
          "1",
          "-q:v",
          "4",
          "-y",
          target,
        ]
      : [
          "-ss",
          kind === "video" ? "0.6" : "0",
          "-i",
          absolutePath,
          "-frames:v",
          "1",
          "-vf",
          "scale=640:-2",
          "-q:v",
          "4",
          "-y",
          target,
        ];
  const result = await runFfmpeg(args, { timeoutMs: 60_000 });
  if (result.code !== 0 || !fs.existsSync(target)) return null;
  return toRelative(target);
}

export async function importUploadedFile(
  file: File,
  projectId: string,
  options: { originalName?: string } = {},
): Promise<{ item: MediaItem; extracted: number }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File exceeds the 2 GB import limit");
  }
  const originalName = options.originalName ?? file.name ?? "upload";
  const extension =
    path.extname(originalName) || extensionForMime(file.type) || ".bin";
  const storedName = uniqueName(`${safeFileName(originalName)}${extension && !path.extname(originalName) ? extension : ""}`);
  const relativePath = `media/${storedName}`;
  const absolutePath = resolveDataPath(relativePath);
  fs.mkdirSync(dirs.media, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(absolutePath, buffer);

  return registerImportedFile({
    projectId,
    originalName,
    mimeType: file.type || mimeForExtension(path.extname(originalName)),
    sizeBytes: file.size,
    relativePath,
    absolutePath,
  });
}

export async function importLocalVideoFile(
  sourcePath: string,
  projectId: string,
  originalName: string,
  mimeType: string,
): Promise<{ item: MediaItem; extracted: number }> {
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) throw new Error("The downloaded media file is invalid");
  if (stat.size > MAX_FILE_BYTES) throw new Error("Video exceeds the 2 GB import limit");

  const probe = await probeMedia(sourcePath);
  if (probe.kind !== "video") throw new Error("The link did not return a playable video file");

  const candidateExtension = path.extname(originalName).toLowerCase();
  const extension = /\.(mp4|mov|webm|mkv|avi|m4v)$/.test(candidateExtension)
    ? candidateExtension
    : extensionForMime(mimeType) || ".mp4";
  const storedName = uniqueName(`${safeFileName(path.basename(originalName, path.extname(originalName)))}${extension}`);
  const relativePath = `media/${storedName}`;
  const absolutePath = resolveDataPath(relativePath);
  fs.mkdirSync(dirs.media, { recursive: true });
  fs.renameSync(sourcePath, absolutePath);

  return registerImportedFile({
    projectId,
    originalName: safeFileName(path.basename(originalName, path.extname(originalName))) + extension,
    mimeType: mimeType.startsWith("video/") ? mimeType : mimeForExtension(extension),
    sizeBytes: stat.size,
    relativePath,
    absolutePath,
    knownProbe: probe,
  });
}

async function registerImportedFile(input: {
  projectId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  relativePath: string;
  absolutePath: string;
  knownProbe?: Awaited<ReturnType<typeof probeMedia>>;
}): Promise<{ item: MediaItem; extracted: number }> {
  const { projectId, originalName, mimeType, sizeBytes, relativePath, absolutePath } = input;

  let probe = null;
  let kind: "video" | "audio" | "image" | "archive" | "other" = "other";
  if (/\.zip$/i.test(originalName) || mimeType === "application/zip") {
    kind = "archive";
  } else if (input.knownProbe) {
    probe = input.knownProbe;
    kind = kindFromProbe(probe.kind, mimeType, originalName);
  } else if (isMediaExtension(originalName) || mimeType.startsWith("video/") || mimeType.startsWith("audio/") || mimeType.startsWith("image/")) {
    try {
      probe = await probeMedia(absolutePath);
      kind = kindFromProbe(probe.kind, mimeType, originalName);
    } catch {
      kind = mimeType.startsWith("video/")
        ? "video"
        : mimeType.startsWith("audio/")
          ? "audio"
          : mimeType.startsWith("image/")
            ? "image"
            : "other";
    }
  }

  const rows = await db
    .insert(media)
    .values({
      projectId,
      name: originalName,
      kind,
      mimeType: mimeType || mimeForExtension(path.extname(originalName)),
      relativePath,
      sizeBytes,
      durationSec: probe?.durationSec ?? null,
      width: probe?.width ?? null,
      height: probe?.height ?? null,
      fps: probe?.fps ?? null,
      videoCodec: probe?.videoCodec ?? null,
      audioCodec: probe?.audioCodec ?? null,
      sampleRate: probe?.sampleRate ?? null,
      channels: probe?.channels ?? null,
      hasAudio: probe?.hasAudio ?? false,
      metadata: probe
        ? {
            formatName: probe.formatName,
            bitRate: probe.bitRate,
            hasVideo: probe.hasVideo,
          }
        : null,
    })
    .returning();

  const item = rows[0];
  const thumbnail = await makeThumbnail(absolutePath, kind, item.id);
  if (thumbnail) {
    await db.update(media).set({ thumbnailPath: thumbnail }).where(eq(media.id, item.id));
    item.thumbnailPath = thumbnail;
  }

  let extracted = 0;
  if (kind === "archive") {
    extracted = await extractArchive(absolutePath, projectId, originalName);
  }

  await logActivity({
    projectId,
    type: "media.imported",
    message: `Imported ${originalName}`,
    meta: { mediaId: item.id, kind, sizeBytes },
  });

  return { item, extracted };
}

function safeZipPath(base: string, entryName: string) {
  const target = path.resolve(base, entryName);
  if (!target.startsWith(path.resolve(base) + path.sep)) {
    throw new Error(`Blocked unsafe archive path: ${entryName}`);
  }
  return target;
}

export async function extractArchive(
  archivePath: string,
  projectId: string,
  archiveName: string,
) {
  const zip = new AdmZip(archivePath);
  const entries = zip.getEntries();
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`Archive has ${entries.length} entries; the limit is ${MAX_ZIP_ENTRIES}`);
  }
  const base = path.join(dirs.workspace, projectId, safeFileName(path.basename(archiveName, ".zip")));
  fs.mkdirSync(base, { recursive: true });
  let total = 0;
  let imported = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const size = entry.header.size;
    total += size;
    if (total > MAX_ZIP_UNCOMPRESSED) {
      throw new Error("Archive expands beyond the 2 GB safety limit");
    }
    const target = safeZipPath(base, entry.entryName);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());

    if (imported < MAX_IMPORTED_FROM_ZIP && isMediaExtension(entry.entryName)) {
      try {
        const probe = await probeMedia(target);
        const relativePath = `media/${uniqueName(safeFileName(path.basename(entry.entryName)))}`;
        const absolute = resolveDataPath(relativePath);
        fs.copyFileSync(target, absolute);
        const rows = await db
          .insert(media)
          .values({
            projectId,
            name: path.basename(entry.entryName),
            kind: kindFromProbe(probe.kind, "", entry.entryName),
            mimeType: mimeForExtension(path.extname(entry.entryName)),
            relativePath,
            sizeBytes: size,
            durationSec: probe.durationSec,
            width: probe.width,
            height: probe.height,
            fps: probe.fps,
            videoCodec: probe.videoCodec,
            audioCodec: probe.audioCodec,
            sampleRate: probe.sampleRate,
            channels: probe.channels,
            hasAudio: probe.hasAudio,
          })
          .returning();
        const thumbnail = await makeThumbnail(absolute, rows[0].kind, rows[0].id);
        if (thumbnail) {
          await db
            .update(media)
            .set({ thumbnailPath: thumbnail })
            .where(eq(media.id, rows[0].id));
        }
        imported += 1;
      } catch {
        // Skip unreadable archive entries but keep the extraction.
      }
    }
  }

  await logActivity({
    projectId,
    type: "archive.extracted",
    message: `Extracted ${archiveName}`,
    meta: { entries: entries.length, importedMedia: imported },
  });
  return imported;
}
