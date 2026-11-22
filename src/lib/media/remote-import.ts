import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { open, rm } from "node:fs/promises";
import { dirs, ensureDirs, safeFileName } from "@/lib/storage";
import { importLocalVideoFile } from "@/lib/media/import";

const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function isBlockedAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }

  if (isIP(address) === 6) {
    const firstBlock = Number.parseInt(address.split(":")[0] || "0", 16);
    const isGlobalUnicast = (firstBlock & 0xe000) === 0x2000;
    return !isGlobalUnicast || /^2001:(?:db8|0)(?::|$)/i.test(address) || /^2002:/i.test(address);
  }

  return true;
}

async function validatePublicHost(url: URL) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Use a public video file link, not a local or private address");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("This link points to a private or unsupported network address");
  }
  return addresses[0];
}

function requestPinned(url: URL, address: { address: string }) {
  const transport = url.protocol === "https:" ? https : http;
  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: { Accept: "video/*, application/octet-stream, */*;q=0.5" },
        lookup: ((
          _hostname: string,
          _options: unknown,
          callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void,
        ) => callback(null, address.address, isIP(address.address))) as never,
      },
      (response) => {
        resolve(response);
      },
    );
    request.setTimeout(30 * 60 * 1000, () => request.destroy(new Error("Video download timed out")));
    request.once("error", reject);
    request.end();
  });
}

function responseHeader(response: IncomingMessage, name: string) {
  const value = response.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function filenameFromResponse(response: IncomingMessage, url: URL) {
  const disposition = responseHeader(response, "content-disposition");
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  let fromHeader = encoded ?? quoted;
  if (encoded) {
    try {
      fromHeader = decodeURIComponent(encoded);
    } catch {
      fromHeader = encoded;
    }
  }
  let fromPath = path.posix.basename(url.pathname);
  try {
    fromPath = decodeURIComponent(fromPath);
  } catch {
    // Keep the URL path as-is when it contains invalid escaping.
  }
  return safeFileName(fromHeader || fromPath || "video.mp4");
}

async function openPublicVideo(urlValue: string) {
  let current = new URL(urlValue);
  if (!/^https?:$/.test(current.protocol) || current.username || current.password) {
    throw new Error("Enter a public HTTP or HTTPS video file link");
  }

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const address = await validatePublicHost(current);
    const response = await requestPinned(current, address);

    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      const location = responseHeader(response, "location");
      response.resume();
      if (!location) throw new Error("The video host returned an invalid redirect");
      current = new URL(location, current);
      if (!/^https?:$/.test(current.protocol) || current.username || current.password) {
        throw new Error("The video link redirected to an unsupported address");
      }
      continue;
    }

    if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
      response.resume();
      throw new Error(`The video host returned HTTP ${response.statusCode}`);
    }

    const contentType = responseHeader(response, "content-type")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (
      contentType &&
      !contentType.startsWith("video/") &&
      !["application/octet-stream", "binary/octet-stream", "application/x-download"].includes(contentType)
    ) {
      response.destroy();
      throw new Error("That page is not a direct video file link. Paste a downloadable .mp4, .mov, .webm or .mkv URL.");
    }

    const contentLength = Number(responseHeader(response, "content-length"));
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      response.destroy();
      throw new Error("Video exceeds the 2 GB import limit");
    }
    if (response.destroyed) throw new Error("The video host returned an empty file");
    return { response, url: current };
  }

  throw new Error("The video link redirected too many times");
}

export async function importVideoFromUrl(urlValue: string, projectId: string) {
  if (urlValue.length > 2048) throw new Error("The video link is too long");
  const parsedUrl = new URL(urlValue.trim());
  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === "youtube.com" || hostname === "m.youtube.com" || hostname === "youtu.be" || hostname === "youtube-nocookie.com") {
    throw new Error("FREMIQ cannot import YouTube watch or live links directly. Upload a video file you own, or paste a direct downloadable video-file URL.");
  }
  const { response, url } = await openPublicVideo(parsedUrl.toString());
  const originalName = filenameFromResponse(response, url);
  const contentType = responseHeader(response, "content-type")
    .split(";")[0]
    .trim()
    .toLowerCase();
  ensureDirs();
  const temporaryPath = path.join(dirs.uploads, `remote-${randomUUID()}.part`);
  const file = await open(temporaryPath, "wx");
  let sizeBytes = 0;

  try {
    for await (const chunk of response) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sizeBytes += value.byteLength;
      if (sizeBytes > MAX_DOWNLOAD_BYTES) {
        response.destroy();
        throw new Error("Video exceeds the 2 GB import limit");
      }
      let offset = 0;
      while (offset < value.length) {
        const { bytesWritten } = await file.write(value, offset, value.length - offset);
        if (bytesWritten === 0) throw new Error("Could not write the downloaded video to disk");
        offset += bytesWritten;
      }
    }
    if (sizeBytes === 0) throw new Error("The video host returned an empty file");
  } catch (error) {
    response.destroy();
    throw error;
  } finally {
    await file.close();
  }

  try {
    // Close the temporary file before importLocalVideoFile renames it; Windows
    // can reject renaming a file while its handle is still open.
    return await importLocalVideoFile(temporaryPath, projectId, originalName, contentType);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
