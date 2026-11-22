import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiAgents } from "@/lib/db/schema";
import type { AgentProbe } from "@/lib/types";
import { commandVersion, findOnPath } from "@/lib/tools";

export type AgentDefinition = {
  key: string;
  name: string;
  binaries: string[];
  capabilities: string[];
  description: string;
  notes: string;
};

export const agentDefinitions: AgentDefinition[] = [
  {
    key: "codex",
    name: "Codex CLI",
    binaries: ["codex"],
    capabilities: ["Code generation", "Repository edits", "Shell workflows"],
    description: "OpenAI Codex command line agent for repository-level edits.",
    notes: "FREMIQ verifies the binary and version. Authentication is handled by the Codex CLI itself.",
  },
  {
    key: "claude",
    name: "Claude Code",
    binaries: ["claude", "claude-code"],
    capabilities: ["Code generation", "Refactoring", "Project context"],
    description: "Anthropic's command line coding agent.",
    notes: "Only the CLI surface is used. FREMIQ never assumes undocumented API access.",
  },
  {
    key: "gemini",
    name: "Gemini CLI",
    binaries: ["gemini"],
    capabilities: ["Code generation", "Long-context analysis", "Repository Q&A"],
    description: "Google Gemini command line agent.",
    notes: "Requires the Gemini CLI to be authenticated on this machine.",
  },
  {
    key: "cursor",
    name: "Cursor",
    binaries: ["cursor-agent", "cursor"],
    capabilities: ["Editor agent", "Codebase Q&A"],
    description: "Cursor's CLI surface where available.",
    notes: "Cursor does not expose every editor feature programmatically. FREMIQ only reports what the CLI supports.",
  },
];

async function probeOne(
  definition: AgentDefinition,
  overridePath: string,
): Promise<AgentProbe> {
  let binary: string | null = null;
  if (overridePath) {
    try {
      if (fs.existsSync(overridePath) && fs.statSync(overridePath).isFile()) {
        binary = overridePath;
      }
    } catch {
      binary = null;
    }
  }
  if (!binary) binary = findOnPath(definition.binaries);

  if (!binary) {
    return {
      key: definition.key,
      name: definition.name,
      installed: false,
      version: null,
      path: null,
      status: "not_installed",
      capabilities: definition.capabilities,
      notes: definition.notes,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  const version = await commandVersion(binary, ["--version"]);
  return {
    key: definition.key,
    name: definition.name,
    installed: true,
    version,
    path: binary,
    status: version ? "connected" : "error",
    capabilities: definition.capabilities,
    notes: version
      ? definition.notes
      : "Binary found but the version health check failed. The CLI may need a repair.",
    lastCheckedAt: new Date().toISOString(),
  };
}

export async function getAgentProbes(): Promise<AgentProbe[]> {
  const rows = await db.select().from(aiAgents);
  const overrides = new Map(rows.map((row) => [row.key, row.executablePath]));
  return Promise.all(
    agentDefinitions.map((definition) => probeOne(definition, overrides.get(definition.key) ?? "")),
  );
}

export async function syncAgents(): Promise<AgentProbe[]> {
  const probes = await getAgentProbes();
  for (const probe of probes) {
    await db
      .insert(aiAgents)
      .values({
        key: probe.key,
        name: probe.name,
        executablePath: "",
        enabled: true,
        status: probe.status,
        version: probe.version,
        lastCheckedAt: new Date(),
        notes: probe.notes,
        capabilities: probe.capabilities,
      })
      .onConflictDoUpdate({
        target: aiAgents.key,
        set: {
          name: probe.name,
          status: probe.status,
          version: probe.version,
          lastCheckedAt: new Date(),
          notes: probe.notes,
          capabilities: probe.capabilities,
          updatedAt: new Date(),
        },
      });
  }
  return probes;
}

export async function getStoredAgents() {
  return db.select().from(aiAgents).orderBy(aiAgents.name);
}

export async function updateAgentConfig(key: string, input: { executablePath?: string; enabled?: boolean }) {
  const definition = agentDefinitions.find((item) => item.key === key);
  if (!definition) throw new Error("Unknown agent");
  const existing = await db.select().from(aiAgents).where(eq(aiAgents.key, key)).limit(1);
  if (existing[0]) {
    await db
      .update(aiAgents)
      .set({
        executablePath: input.executablePath ?? existing[0].executablePath,
        enabled: input.enabled ?? existing[0].enabled,
        updatedAt: new Date(),
      })
      .where(eq(aiAgents.key, key));
  } else {
    await db.insert(aiAgents).values({
      key,
      name: definition.name,
      executablePath: input.executablePath ?? "",
      enabled: input.enabled ?? true,
      status: "unknown",
      capabilities: definition.capabilities,
    });
  }
  const probes = await syncAgents();
  return probes.find((probe) => probe.key === key) ?? null;
}

export async function testAgent(key: string) {
  const definition = agentDefinitions.find((item) => item.key === key);
  if (!definition) throw new Error("Unknown agent");
  const rows = await db.select().from(aiAgents).where(eq(aiAgents.key, key)).limit(1);
  const probe = await probeOne(definition, rows[0]?.executablePath ?? "");
  await syncAgents();
  return probe;
}
