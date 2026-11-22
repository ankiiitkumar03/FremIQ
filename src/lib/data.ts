import { cookies } from "next/headers";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activity,
  editingPlans,
  jobs,
  media,
  projects,
  subtitleTracks,
  timelines,
  type Project,
} from "@/lib/db/schema";

export const ACTIVE_PROJECT_COOKIE = "fremiq_project";

export async function getProjects(): Promise<Project[]> {
  return db.select().from(projects).orderBy(desc(projects.updatedAt));
}

export async function getActiveProject(): Promise<Project | null> {
  const store = await cookies();
  const cookieId = store.get(ACTIVE_PROJECT_COOKIE)?.value;
  const all = await getProjects();
  if (all.length === 0) return null;
  if (cookieId) {
    const match = all.find((project) => project.id === cookieId);
    if (match) return match;
  }
  return all[0];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function logActivity(input: {
  projectId?: string | null;
  type: string;
  message: string;
  meta?: Record<string, unknown>;
}) {
  await db.insert(activity).values({
    projectId: input.projectId ?? null,
    type: input.type,
    message: input.message,
    meta: input.meta,
  });
}

export async function getRecentActivity(limit = 12) {
  return db.select().from(activity).orderBy(desc(activity.createdAt)).limit(limit);
}

export async function getProjectActivity(projectId: string, limit = 20) {
  return db
    .select()
    .from(activity)
    .where(eq(activity.projectId, projectId))
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}

export async function getDashboardData() {
  const activeStatuses = ["queued", "preparing", "analyzing", "processing", "rendering"];

  const [projectCount] = await db.select({ value: count() }).from(projects);
  const [mediaCount] = await db.select({ value: count() }).from(media);
  const [completedCount] = await db
    .select({ value: count() })
    .from(jobs)
    .where(eq(jobs.status, "completed"));
  const [failedCount] = await db
    .select({ value: count() })
    .from(jobs)
    .where(eq(jobs.status, "failed"));
  const [activeCount] = await db
    .select({ value: count() })
    .from(jobs)
    .where(inArray(jobs.status, activeStatuses));
  const [exportedBytes] = await db
    .select({ value: sql<number>`coalesce(sum(${jobs.outputSizeBytes}), 0)` })
    .from(jobs)
    .where(eq(jobs.status, "completed"));

  const recentProjects = await db
    .select({
      project: projects,
      mediaCount: sql<number>`(select count(*) from ${media} where ${media.projectId} = ${projects.id})`,
      jobCount: sql<number>`(select count(*) from ${jobs} where ${jobs.projectId} = ${projects.id})`,
      lastJobAt: sql<Date | null>`(select max(${jobs.createdAt}) from ${jobs} where ${jobs.projectId} = ${projects.id})`,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .limit(5);

  const recentExports = await db
    .select({ job: jobs, projectName: projects.name })
    .from(jobs)
    .innerJoin(projects, eq(jobs.projectId, projects.id))
    .where(eq(jobs.status, "completed"))
    .orderBy(desc(jobs.completedAt))
    .limit(5);

  const activeJobs = await db
    .select({ job: jobs, projectName: projects.name })
    .from(jobs)
    .innerJoin(projects, eq(jobs.projectId, projects.id))
    .where(inArray(jobs.status, activeStatuses))
    .orderBy(desc(jobs.createdAt))
    .limit(6);

  const feed = await getRecentActivity(10);

  const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const dailyRows = await db
    .select({
      day: sql<string>`to_char(${jobs.createdAt}, 'YYYY-MM-DD')`,
      total: count(),
      completed: sql<number>`count(*) filter (where ${jobs.status} = 'completed')`,
      failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed')`,
    })
    .from(jobs)
    .where(gte(jobs.createdAt, since))
    .groupBy(sql`to_char(${jobs.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${jobs.createdAt}, 'YYYY-MM-DD')`);

  const dayMap = new Map(dailyRows.map((row) => [row.day, row]));
  const daily = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const row = dayMap.get(key);
    return {
      day: key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      total: Number(row?.total ?? 0),
      completed: Number(row?.completed ?? 0),
      failed: Number(row?.failed ?? 0),
    };
  });

  return {
    counts: {
      projects: Number(projectCount?.value ?? 0),
      media: Number(mediaCount?.value ?? 0),
      completed: Number(completedCount?.value ?? 0),
      failed: Number(failedCount?.value ?? 0),
      active: Number(activeCount?.value ?? 0),
      exportedBytes: Number(exportedBytes?.value ?? 0),
    },
    recentProjects,
    recentExports,
    activeJobs,
    feed,
    daily,
  };
}

export async function getProjectStats(projectId: string) {
  const [mediaCount] = await db
    .select({ value: count() })
    .from(media)
    .where(eq(media.projectId, projectId));
  const [planCount] = await db
    .select({ value: count() })
    .from(editingPlans)
    .where(eq(editingPlans.projectId, projectId));
  const [jobCount] = await db
    .select({ value: count() })
    .from(jobs)
    .where(eq(jobs.projectId, projectId));
  return {
    media: Number(mediaCount?.value ?? 0),
    plans: Number(planCount?.value ?? 0),
    jobs: Number(jobCount?.value ?? 0),
  };
}

export async function getProjectMedia(projectId: string) {
  return db
    .select()
    .from(media)
    .where(eq(media.projectId, projectId))
    .orderBy(desc(media.createdAt));
}

export async function getProjectTimeline(projectId: string) {
  const rows = await db
    .select()
    .from(timelines)
    .where(eq(timelines.projectId, projectId))
    .orderBy(desc(timelines.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getProjectSubtitles(projectId: string) {
  return db
    .select()
    .from(subtitleTracks)
    .where(eq(subtitleTracks.projectId, projectId))
    .orderBy(desc(subtitleTracks.updatedAt));
}

export async function getProjectJobs(projectId?: string, limit = 50) {
  const base = db
    .select({ job: jobs, projectName: projects.name })
    .from(jobs)
    .innerJoin(projects, eq(jobs.projectId, projects.id));
  if (projectId) {
    return base
      .where(eq(jobs.projectId, projectId))
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  }
  return base.orderBy(desc(jobs.createdAt)).limit(limit);
}

export async function getJobWithProject(jobId: string) {
  const rows = await db
    .select({ job: jobs, project: projects })
    .from(jobs)
    .innerJoin(projects, eq(jobs.projectId, projects.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getProjectPlans(projectId: string) {
  return db
    .select()
    .from(editingPlans)
    .where(eq(editingPlans.projectId, projectId))
    .orderBy(desc(editingPlans.createdAt));
}

export async function getLatestPlan(projectId: string) {
  const rows = await db
    .select()
    .from(editingPlans)
    .where(eq(editingPlans.projectId, projectId))
    .orderBy(desc(editingPlans.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveProjectMedia(projectId: string, kind?: string) {
  const conditions = [eq(media.projectId, projectId)];
  if (kind) conditions.push(eq(media.kind, kind));
  return db
    .select()
    .from(media)
    .where(and(...conditions))
    .orderBy(desc(media.createdAt));
}
