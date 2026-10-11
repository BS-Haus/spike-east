CREATE TABLE "tournament_entries" (
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"state" text DEFAULT 'going' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_entries_tournament_id_player_id_pk" PRIMARY KEY("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"group_no" integer NOT NULL,
	"group_name" text NOT NULL,
	"seq" integer NOT NULL,
	"ord" integer NOT NULL,
	"net" integer NOT NULL,
	"a1" uuid NOT NULL,
	"a2" uuid NOT NULL,
	"b1" uuid NOT NULL,
	"b2" uuid NOT NULL,
	"subs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score_a" integer,
	"score_b" integer,
	"status" text DEFAULT 'todo' NOT NULL,
	"entered_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"no" integer NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"nets" integer DEFAULT 2 NOT NULL,
	"group_to" integer DEFAULT 15 NOT NULL,
	"final_to" integer DEFAULT 15 NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_stage_id_tournament_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."tournament_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_a1_players_id_fk" FOREIGN KEY ("a1") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_a2_players_id_fk" FOREIGN KEY ("a2") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_b1_players_id_fk" FOREIGN KEY ("b1") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_b2_players_id_fk" FOREIGN KEY ("b2") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_entered_by_id_players_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_stages" ADD CONSTRAINT "tournament_stages_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_games_tournament_idx" ON "tournament_games" USING btree ("tournament_id");