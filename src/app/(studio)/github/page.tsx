import { GithubClient } from "@/components/studio/github-client";
import { PageHeader } from "@/components/ui-kit";
import { getProjects } from "@/lib/data";
import { getGithubStatus, getImportedRepos } from "@/lib/github";

export const dynamic = "force-dynamic";
export const metadata = { title: "GitHub Projects" };

export default async function GithubPage() {
  const [status, imported, projects] = await Promise.all([
    getGithubStatus(),
    getImportedRepos(),
    getProjects(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automate"
        title="GitHub Projects"
        description="Import a repository into a FREMIQ project and keep the cloned workspace beside your media. FREMIQ never runs repository scripts on import."
      />
      <GithubClient
        status={status}
        imported={imported.map((repo) => ({
          id: repo.id,
          owner: repo.owner,
          repo: repo.repo,
          branch: repo.branch,
          url: repo.url,
          status: repo.status,
          projectId: repo.projectId,
          createdAt: repo.createdAt.toISOString(),
        }))}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
      />
    </div>
  );
}
