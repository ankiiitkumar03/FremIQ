import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("active"),
    aspectRatio: text("aspect_ratio").notNull().default("16:9"),
    resolution: text("resolution").notNull().default("1920x1080"),
    frameRate: integer("frame_rate").notNull().default(30),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("projects_status_idx").on(table.status)],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    relativePath: text("relative_path").notNull(),
    thumbnailPath: text("thumbnail_path"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    durationSec: doublePrecision("duration_sec"),
    width: integer("width"),
    height: integer("height"),
    fps: doublePrecision("fps"),
    videoCodec: text("video_codec"),
    audioCodec: text("audio_codec"),
    sampleRate: integer("sample_rate"),
    channels: integer("channels"),
    hasAudio: boolean("has_audio").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [index("media_project_idx").on(table.projectId)],
);

export const timelines = pgTable(
  "timelines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Main timeline"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    durationSec: doublePrecision("duration_sec").notNull().default(0),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [index("timelines_project_idx").on(table.projectId)],
);

export const subtitleTracks = pgTable(
  "subtitle_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    name: text("name").notNull().default("Captions"),
    language: text("language").notNull().default("en"),
    format: text("format").notNull().default("srt"),
    style: jsonb("style").$type<Record<string, unknown>>().notNull(),
    cues: jsonb("cues").$type<unknown[]>().notNull(),
    source: text("source").notNull().default("imported"),
    ...timestamps,
  },
  (table) => [index("subtitle_project_idx").on(table.projectId)],
);

export const editingPlans = pgTable(
  "editing_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    summary: text("summary").notNull().default(""),
    engine: text("engine").notNull().default("fremiq-planner"),
    status: text("status").notNull().default("draft"),
    operations: jsonb("operations").$type<unknown[]>().notNull(),
    context: jsonb("context").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [index("plans_project_idx").on(table.projectId)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => editingPlans.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("render"),
    status: text("status").notNull().default("queued"),
    stage: text("stage").notNull().default("Queued"),
    progress: integer("progress").notNull().default(0),
    priority: integer("priority").notNull().default(0),
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
    outputPath: text("output_path"),
    outputSizeBytes: integer("output_size_bytes"),
    logs: text("logs").notNull().default(""),
    error: text("error"),
    source: text("source").notNull().default("web"),
    backend: text("backend").notNull().default("ffmpeg"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("jobs_project_idx").on(table.projectId),
    index("jobs_status_idx").on(table.status),
  ],
);

export const aiAgents = pgTable(
  "ai_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    executablePath: text("executable_path").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    status: text("status").notNull().default("unknown"),
    version: text("version"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [uniqueIndex("agents_key_idx").on(table.key)],
);

export const githubRepos = pgTable(
  "github_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    branch: text("branch").notNull().default("main"),
    url: text("url").notNull(),
    clonePath: text("clone_path"),
    status: text("status").notNull().default("imported"),
    ...timestamps,
  },
  (table) => [index("repos_project_idx").on(table.projectId)],
);

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("activity_created_idx").on(table.createdAt)],
);

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("default"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type MediaItem = typeof media.$inferSelect;
export type Timeline = typeof timelines.$inferSelect;
export type SubtitleTrack = typeof subtitleTracks.$inferSelect;
export type EditingPlan = typeof editingPlans.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type AiAgent = typeof aiAgents.$inferSelect;
export type GithubRepo = typeof githubRepos.$inferSelect;
export type ActivityItem = typeof activity.$inferSelect;
export type JobRecord = typeof jobs.$inferSelect;

export const extensions = pgTable("extensions", {
  id: text("id").primaryKey(),
  version: text("version"),
  status: text("status").notNull().default("not_installed"),
  enabled: boolean("enabled").notNull().default(false),
  health: text("health").notNull().default("unknown"),
  healthDetail: text("health_detail"),
  installPath: text("install_path"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  lastError: text("last_error"),
  lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
  installedAt: timestamp("installed_at", { withTimezone: true }),
  logs: text("logs").notNull().default(""),
  ...timestamps,
});

export type ExtensionRecord = typeof extensions.$inferSelect;
