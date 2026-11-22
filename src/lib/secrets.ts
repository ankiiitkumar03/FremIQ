import crypto from "node:crypto";

function key() {
  const configuredSecret = process.env.FREMIQ_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredSecret) {
    throw new Error("FREMIQ_SECRET must be configured in production");
  }
  const secret = configuredSecret ?? process.env.DATABASE_URL ?? "fremiq-local-development-secret";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): string {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value || !value.startsWith("v1:")) return value ?? "";
  try {
    const [, ivB64, tagB64, dataB64] = value.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 3)}••••••••${value.slice(-4)}`;
}
