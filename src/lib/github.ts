import fs from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { githubRepos, projects } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { decryptSecret } from "@/lib/secrets";
import { findOnPath } from "@/lib/tools";
import { runBinary } from "@/lib/media/ffmpeg";
import { dirs } from "@/lib/storage";
import { logActivity } from "@/lib/data";

function sanitize(value: string, token: string) {
  if (!token) return value;
  return value.split(token).join("***");
}

export type ParsedRepo = { owner: string; repo: string; url: string };

export function parseRepoInput(input: string): ParsedRepo {
  const trimmed = input.trim().replace(/\.git$/, "");
  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      url: `https://github.com/${urlMatch[1]}/${urlMatch[2]}`,
    };
  }
  const shortMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      url: `https://github.com/${shortMatch[1]}/${shortMatch[2]}`,
    };
  }
  throw new Error("Enter a GitHub repository as owner/repo or a full GitHub URL");
}

async function githubFetch(pathname: string, token: string) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

export async function getGithubStatus() {
  const settings = await getSettings();
  const token = decryptSecret(settings.github.token);
  if (!token) {
    return {
      connected: false,
      login: null as string | null,
      message: "Add a GitHub personal access token in Settings to list private repositories.",
      gitAvailable: Boolean(findOnPath(["git"])),
    };
  }
  try {
    const user = (await githubFetch("/user", token)) as { login?: string; avatar_url?: string };
    return {
      connected: true,
      login: user.login ?? null,
      avatarUrl: user.avatar_url ?? null,
      message: "GitHub authentication verified",
      gitAvailable: Boolean(findOnPath(["git"])),
    };
  } catch (error) {
    return {
      connected: false,
      login: null as string | null,
      message: error instanceof Error ? error.message : "GitHub authentication failed",
      gitAvailable: Boolean(findOnPath(["git"])),
    };
  }
}

export async function listGithubRepos() {
  const settings = await getSettings();
  const token = decryptSecret(settings.github.token);
  if (!token) throw new Error("GitHub token is required to list repositories");
  const repos = (await githubFetch("/user/repos?per_page=50&sort=updated", token)) as Array<{
    full_name: string;
    name: string;
    owner: { login: string };
    private: boolean;
    default_branch: string;
    html_url: string;
    updated_at: string;
    description: string | null;
  }>;
  return repos.map((repo) => ({
    fullName: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    private: repo.private,
    defaultBranch: repo.default_branch,
    url: repo.html_url,
    updatedAt: repo.updated_at,
    description: repo.description,
  }));
}

export async function listBranches(owner: string, repo: string) {
  const settings = await getSettings();
  const token = decryptSecret(settings.github.token);
  const branches = (await githubFetch(
    `/repos/${owner}/${repo}/branches?per_page=100`,
    token,
  )) as Array<{ name: string }>;
  return branches.map((branch) => branch.name);
}

export async function importRepository(input: {
  repoInput: string;
  branch?: string;
  projectId?: string;
}) {
  const settings = await getSettings();
  const token = decryptSecret(settings.github.token);
  const git = findOnPath(["git"]);
  if (!git) throw new Error("Git is not installed on the processing host");
  const parsed = parseRepoInput(input.repoInput);

  let projectId = input.projectId ?? null;
  if (!projectId) {
    const rows = await db
      .insert(projects)
      .values({
        name: parsed.repo,
        description: `Imported from ${parsed.url}`,
        status: "active",
      })
      .returning();
    projectId = rows[0].id;
  }

  const branch = input.branch?.trim() || settings.github.defaultBranch || "main";
  const cloneRoot = path.join(dirs.workspace, projectId);
  fs.mkdirSync(cloneRoot, { recursive: true });
  const destination = path.join(cloneRoot, parsed.repo);
  if (fs.existsSync(destination)) {
    throw new Error(`Workspace already contains ${parsed.repo}. Remove it before importing again.`);
  }

  const cloneUrl = token
    ? `https://x-access-token:${token}@github.com/${parsed.owner}/${parsed.repo}.git`
    : `${parsed.url}.git`;

  const result = await runBinary(
    git,
    ["clone", "--depth", "1", "--branch", branch, cloneUrl, destination],
    { timeoutMs: 5 * 60 * 1000 },
  );

  if (result.code !== 0) {
    throw new Error(
      sanitize(
        `git clone failed: ${result.stderr.split("\n").filter(Boolean).slice(-4).join(" ")}`,
        token,
      ),
    );
  }

  const rows = await db
    .insert(githubRepos)
    .values({
      projectId,
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
      url: parsed.url,
      clonePath: path.relative(dirs.root, destination).split(path.sep).join("/"),
      status: "imported",
    })
    .returning();

  await logActivity({
    projectId,
    type: "github.imported",
    message: `Imported GitHub repository ${parsed.owner}/${parsed.repo}`,
    meta: { repoId: rows[0].id, branch },
  });

  return {
    repo: rows[0],
    projectId,
    files: listWorkspaceFiles(destination),
    notice:
      "Repository scripts were not executed. Dependencies are only installed after explicit approval.",
  };
}

export function listWorkspaceFiles(destination: string) {
  const entries = fs.readdirSync(destination, { withFileTypes: true });
  return entries
    .filter((entry) => entry.name !== ".git")
    .slice(0, 60)
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }));
}

export async function getImportedRepos() {
  return db.select().from(githubRepos).orderBy(desc(githubRepos.createdAt));
}

export async function getRepoFiles(repoId: string) {
  const rows = await db.select().from(githubRepos).where(eq(githubRepos.id, repoId)).limit(1);
  const repo = rows[0];
  if (!repo?.clonePath) throw new Error("Repository workspace not found");
  const absolute = path.resolve(dirs.root, repo.clonePath);
  if (!absolute.startsWith(path.resolve(dirs.root) + path.sep)) {
    throw new Error("Repository path is outside the workspace");
  }
  if (!fs.existsSync(absolute)) throw new Error("Repository workspace is missing on disk");
  return { repo, files: listWorkspaceFiles(absolute), absolutePath: absolute };
}
