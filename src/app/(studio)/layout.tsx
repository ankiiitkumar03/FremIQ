import { AppShell } from "@/components/app-shell";
import { getActiveProject, getProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [projects, active] = await Promise.all([getProjects(), getActiveProject()]);
  return (
    <AppShell
      projects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        isDemo: project.isDemo,
      }))}
      activeProjectId={active?.id ?? null}
    >
      {children}
    </AppShell>
  );
}
