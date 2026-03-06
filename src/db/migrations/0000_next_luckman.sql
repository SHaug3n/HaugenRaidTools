CREATE TABLE "fights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"encounter_id" integer NOT NULL,
	"encounter_name" varchar(128) NOT NULL,
	"difficulty_id" integer NOT NULL,
	"pull_number" integer NOT NULL,
	"kill" boolean NOT NULL,
	"boss_pct" smallint,
	"duration_ms" integer NOT NULL,
	"fight_start_unix_ms" bigint NOT NULL,
	"fight_end_unix_ms" bigint NOT NULL,
	"wcl_fight_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invite_tokens" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"team_id" uuid,
	"created_by" uuid,
	"expires_at" timestamp with time zone,
	"used_by" uuid,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid,
	"instance_name" varchar(128) NOT NULL,
	"date" date NOT NULL,
	"wcl_report_code" varchar(32),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fight_id" uuid,
	"user_id" uuid,
	"storage_key" text NOT NULL,
	"video_start_unix_ms" bigint NOT NULL,
	"duration_ms" integer NOT NULL,
	"status" varchar(16) DEFAULT 'uploading',
	"file_size_bytes" bigint,
	"format" varchar(16) DEFAULT 'compressed',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'member',
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fight_id" uuid,
	"timestamp_ms" integer NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"label" text NOT NULL,
	"player_name" varchar(64),
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(128),
	"role" varchar(16) DEFAULT 'member',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wcl_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_code" varchar(32) NOT NULL,
	"fight_id" integer,
	"data_type" varchar(32) NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fights" ADD CONSTRAINT "fights_session_id_raid_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."raid_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_sessions" ADD CONSTRAINT "raid_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_fight_id_fights_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."fights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_fight_id_fights_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."fights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fights_session" ON "fights" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_team" ON "raid_sessions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_recordings_fight" ON "recordings" USING btree ("fight_id");--> statement-breakpoint
CREATE INDEX "idx_timeline_fight" ON "timeline_events" USING btree ("fight_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wcl_cache_unique" ON "wcl_cache" USING btree ("report_code","fight_id","data_type");