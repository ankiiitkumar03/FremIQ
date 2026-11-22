import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { extensions, type ExtensionRecord } from "@/lib/db/schema";
import { logActivity } from "@/lib/data";
import { getAdapter } from "./adapters";
import { sanitizeLog } from "./runner";
import {
  checkExtensionDependencies,
  detectHostDependencies,
  extensionRoot,
  platformKey,
} from "./dependencies";
import { extensionRegistry, getDefinition } from "./registry";
import type {
  ExtensionContext,
  ExtensionExecutePayload,
  ExtensionOperationResult,
  ExtensionView,
} from "./types";

const LOG_LIMIT = 24_000;

function appendToLog(existing: string, line: string) {
  const stamped = `[${new Date().toISOString()}] ${sanitizeLog(line)}`;
  const next = `${existing}${existing ? "\n" : ""}${stamped}`;
  return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
}

async function ensureRow(id: string): Promise<ExtensionRecord> {
  await db.insert(extensions).values({ id }).onConflictDoNothing();
  const rows = await db.select().from(extensions).where(eq(extensions.id, id)).limit(1);
  if (!rows[0]) throw new Error(`Extension ${id} could not be initialised`);
  return rows[0];
}

async function ensureAllRows() {
  for (const definition of extensionRegistry) {
    await db.insert(extensions).values({ id: definition.id }).onConflictDoNothing();
  }
}

export function extensionInstallDir(id: string) {
  const root = path.resolve(extensionRoot());
  const target = path.resolve(root, id);
  if (!target.startsWith(root + path.sep)) throw new Error("Invalid extension directory");
  return target;
}

function makeContext(record: ExtensionRecord, definition: NonNullable<ReturnType<typeof getDefinition>>) {
  const lines: string[] = [];
  const context: ExtensionContext = {
    definition,
    installDir: extensionInstallDir(definition.id),
    config: record.config ?? {},
    appendLog: (line) => {
      lines.push(line);
    },
  };
  return { context, lines };
}

export async function getExtensionViews(): Promise<ExtensionView[]> {
  await ensureAllRows();
  const [rows, host] = await Promise.all([
    db.select().from(extensions),
    detectHostDependencies(),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const views: ExtensionView[] = [];
  for (const definition of extensionRegistry) {
    const record = byId.get(definition.id);
    if (!record) continue;
    const installed = record.status === "installed";
    const enabled = Boolean(record.enabled);
    const health = record.health as ExtensionView["health"];
    const { missing } = await checkExtensionDependencies(definition, host);
    views.push({
      definition,
      status: record.status as ExtensionView["status"],
      enabled,
      health,
      installedVersion: record.version,
      installPath: record.installPath,
      lastError: record.lastError,
      lastHealthAt: record.lastHealthAt ? record.lastHealthAt.toISOString() : null,
      installedAt: record.installedAt ? record.installedAt.toISOString() : null,
      logs: record.logs,
      installed,
      operational: installed && enabled && health === "ok",
      config: record.config ?? {},
      missingDependencies: missing,
      healthDetail: record.healthDetail,
    });
  }
  return views;
}

export async function getExtensionView(id: string): Promise<ExtensionView> {
  const views = await getExtensionViews();
  const view = views.find((item) => item.definition.id === id);
  if (!view) throw new Error("Unknown extension");
  return view;
}

export type InstallOptions = {
  confirm: boolean;
  licenseAccepted?: boolean;
};

export async function installExtension(
  id: string,
  options: InstallOptions,
): Promise<ExtensionOperationResult> {
  const definition = getDefinition(id);
  if (!definition) throw new Error("Unknown extension");
  if (!options.confirm) {
    throw new Error("Explicit confirmation is required before installing an extension");
  }
  if (definition.verification !== "verified" || definition.installMethod === "unverified") {
    throw new Error(
      `${definition.name} is a planned extension. FREMIQ has not verified its project or installation procedure, so it cannot be installed.`,
    );
  }
  if (definition.license.acknowledgementRequired && !options.licenseAccepted) {
    throw new Error(`Review and accept the ${definition.name} license terms before installing`);
  }
  const platform = platformKey();
  if (definition.supportedPlatforms.length > 0 && !definition.supportedPlatforms.includes(platform)) {
    throw new Error(`${definition.name} does not declare support for ${platform}`);
  }

  const host = await detectHostDependencies();
  const dependencyCheck = await checkExtensionDependencies(definition, host);
  if (!dependencyCheck.satisfied) {
    const missing = dependencyCheck.missing.filter((item) => item.required);
    throw new Error(
      `Missing required dependencies: ${missing.map((item) => item.name).join(", ")}. ${missing[0]?.hint ?? ""}`,
    );
  }

  const record = await ensureRow(id);
  const { context, lines } = makeContext(record, definition);
  const adapter = getAdapter(definition);
  let logs = appendToLog(record.logs, `Install requested for ${definition.name} ${definition.version}`);
  await db
    .update(extensions)
    .set({
      status: "installing",
      lastError: null,
      logs,
      updatedAt: new Date(),
    })
    .where(eq(extensions.id, id));

  try {
    const result = await adapter.install(context);
    for (const line of lines) logs = appendToLog(logs, line);

    if (!result.ok) {
      logs = appendToLog(logs, `Install failed: ${result.message}`);
      await db
        .update(extensions)
        .set({
          status: record.status === "installed" ? "installed" : "error",
          lastError: result.message,
          logs,
          updatedAt: new Date(),
        })
        .where(eq(extensions.id, id));
      return { ...result, logs: [result.message] };
    }

    const detection = await adapter.detect();
    const health = await adapter.healthCheck(context);
    logs = appendToLog(logs, `Health check: ${health.health} — ${health.detail}`);
    const now = new Date();
    await db
      .update(extensions)
      .set({
        status: "installed",
        enabled: true,
        health: health.health,
        healthDetail: health.detail,
        lastHealthAt: now,
        installedAt: now,
        version: detection.version ?? definition.version,
        installPath: detection.path ?? context.installDir,
        lastError: null,
        logs,
        updatedAt: now,
      })
      .where(eq(extensions.id, id));

    await logActivity({
      type: "extension.installed",
      message: `Installed creative extension ${definition.name} ${detection.version ?? definition.version}`,
      meta: { extensionId: id, health: health.health },
    });

    return {
      ok: true,
      message: `${definition.name} installed. Health: ${health.health}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Install failed";
    logs = appendToLog(logs, `Install error: ${message}`);
    await db
      .update(extensions)
      .set({
        status: record.status === "installed" ? "installed" : "error",
        lastError: message,
        logs,
        updatedAt: new Date(),
      })
      .where(eq(extensions.id, id));
    throw error;
  }
}

async function transition(
  id: string,
  status: ExtensionView["status"],
  operation: "update" | "uninstall",
): Promise<ExtensionOperationResult> {
  const definition = getDefinition(id);
  if (!definition) throw new Error("Unknown extension");
  const record = await ensureRow(id);
  if (record.status !== "installed") {
    throw new Error(`${definition.name} is not installed`);
  }
  const { context, lines } = makeContext(record, definition);
  const adapter = getAdapter(definition);
  let logs = appendToLog(record.logs, `${operation === "update" ? "Update" : "Uninstall"} requested`);
  await db
    .update(extensions)
    .set({ status, lastError: null, logs, updatedAt: new Date() })
    .where(eq(extensions.id, id));

  try {
    const result =
      operation === "update" ? await adapter.update(context) : await adapter.uninstall(context);
    for (const line of lines) logs = appendToLog(logs, line);

    if (!result.ok) {
      logs = appendToLog(logs, `Operation failed: ${result.message}`);
      await db
        .update(extensions)
        .set({ status: "installed", lastError: result.message, logs, updatedAt: new Date() })
        .where(eq(extensions.id, id));
      return result;
    }

    if (operation === "uninstall") {
      logs = appendToLog(logs, "Extension removed");
      await db
        .update(extensions)
        .set({
          status: "not_installed",
          enabled: false,
          health: "unknown",
          healthDetail: null,
          version: null,
          installPath: null,
          installedAt: null,
          lastHealthAt: null,
          lastError: null,
          logs,
          updatedAt: new Date(),
        })
        .where(eq(extensions.id, id));
      await logActivity({
        type: "extension.uninstalled",
        message: `Uninstalled creative extension ${definition.name}`,
        meta: { extensionId: id },
      });
      return { ok: true, message: `${definition.name} uninstalled` };
    }

    const health = await adapter.healthCheck(context);
    const detection = await adapter.detect();
    logs = appendToLog(logs, `Health check: ${health.health} — ${health.detail}`);
    await db
      .update(extensions)
      .set({
        status: "installed",
        health: health.health,
        healthDetail: health.detail,
        version: detection.version ?? definition.version,
        lastHealthAt: new Date(),
        logs,
        updatedAt: new Date(),
      })
      .where(eq(extensions.id, id));
    return { ok: true, message: `${definition.name} updated. Health: ${health.health}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation failed";
    logs = appendToLog(logs, `Operation error: ${message}`);
    await db
      .update(extensions)
      .set({ status: "installed", lastError: message, logs, updatedAt: new Date() })
      .where(eq(extensions.id, id));
    throw error;
  }
}

export function updateExtension(id: string) {
  return transition(id, "updating", "update");
}

export function uninstallExtension(id: string) {
  return transition(id, "uninstalling", "uninstall");
}

export async function setExtensionEnabled(id: string, enabled: boolean): Promise<ExtensionView> {
  const definition = getDefinition(id);
  if (!definition) throw new Error("Unknown extension");
  const record = await ensureRow(id);
  if (enabled && record.status !== "installed") {
    throw new Error(`Install ${definition.name} before enabling it`);
  }
  const adapter = getAdapter(definition);
  const { context, lines } = makeContext(record, definition);
  let logs = appendToLog(record.logs, `${enabled ? "Enable" : "Disable"} requested`);

  if (enabled) {
    await adapter.enable(context);
  } else {
    await adapter.disable(context);
  }
  for (const line of lines) logs = appendToLog(logs, line);

  let health = record.health as ExtensionView["health"];
  let healthDetail = record.healthDetail;
  if (enabled && record.status === "installed") {
    const result = await adapter.healthCheck(context);
    health = result.health;
    healthDetail = result.detail;
    logs = appendToLog(logs, `Health check: ${result.health} — ${result.detail}`);
  }

  await db
    .update(extensions)
    .set({
      enabled,
      health,
      healthDetail,
      lastHealthAt: enabled ? new Date() : record.lastHealthAt,
      logs,
      updatedAt: new Date(),
    })
    .where(eq(extensions.id, id));

  return getExtensionView(id);
}

export async function healthCheckExtension(id: string): Promise<ExtensionView> {
  const definition = getDefinition(id);
  if (!definition) throw new Error("Unknown extension");
  const record = await ensureRow(id);
  if (record.status !== "installed") throw new Error(`${definition.name} is not installed`);
  const adapter = getAdapter(definition);
  const { context, lines } = makeContext(record, definition);
  const result = await adapter.healthCheck(context);
  let logs = appendToLog(record.logs, `Health check: ${result.health} — ${result.detail}`);
  for (const line of lines) logs = appendToLog(logs, line);
  await db
    .update(extensions)
    .set({
      health: result.health,
      healthDetail: result.detail,
      lastHealthAt: new Date(),
      logs,
      updatedAt: new Date(),
    })
    .where(eq(extensions.id, id));
  return getExtensionView(id);
}

export async function saveExtensionConfig(
  id: string,
  patch: Record<string, unknown>,
): Promise<ExtensionView> {
  const definition = getDefinition(id);
  if (!definition) throw new Error("Unknown extension");
  const record = await ensureRow(id);
  const allowed = ["projectDir", "entryPoint", "compositionId", "listeningModelsEnabled"];
  const nextConfig = { ...(record.config ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key)) continue;
    if (typeof value === "string") nextConfig[key] = value.slice(0, 500);
    else if (typeof value === "boolean") nextConfig[key] = value;
  }
  if (nextConfig.listeningModelsEnabled === true && definition.id === "earshot") {
    throw new Error(
      "Listening models are optional downloads. FREMIQ keeps them disabled until the local agent installs them with explicit approval.",
    );
  }
  await db
    .update(extensions)
    .set({
      config: nextConfig,
      logs: appendToLog(record.logs, "Configuration updated"),
      updatedAt: new Date(),
    })
    .where(eq(extensions.id, id));
  return getExtensionView(id);
}

export async function executeExtension(
  id: string,
  payload: ExtensionExecutePayload,
): Promise<ExtensionOperationResult> {
  const definition = getDefinition(id);
  if (!definition) throw new Error("Unknown extension");
  const record = await ensureRow(id);
  if (record.status !== "installed") throw new Error(`${definition.name} is not installed`);
  if (!record.enabled) throw new Error(`Enable ${definition.name} before running it`);
  const adapter = getAdapter(definition);
  const { context, lines } = makeContext(record, definition);
  const result = await adapter.execute(context, payload);
  let logs = appendToLog(record.logs, `Execute: ${result.message}`);
  for (const line of lines) logs = appendToLog(logs, line);
  await db
    .update(extensions)
    .set({ logs, updatedAt: new Date() })
    .where(eq(extensions.id, id));
  return result;
}

export async function getExtensionLogs(id: string): Promise<string> {
  const record = await ensureRow(id);
  return record.logs;
}

export async function isExtensionOperational(id: string): Promise<boolean> {
  const definition = getDefinition(id);
  if (!definition) return false;
  const record = await ensureRow(id);
  return record.status === "installed" && record.enabled && record.health === "ok";
}

export function extensionDirectoryExists(id: string) {
  return fs.existsSync(extensionInstallDir(id));
}
