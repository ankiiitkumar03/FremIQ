CREATE TABLE "extensions" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text,
	"status" text DEFAULT 'not_installed' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"health" text DEFAULT 'unknown' NOT NULL,
	"health_detail" text,
	"install_path" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"last_health_at" timestamp with time zone,
	"installed_at" timestamp with time zone,
	"logs" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "backend" text DEFAULT 'ffmpeg' NOT NULL;