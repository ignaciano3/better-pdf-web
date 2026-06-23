CREATE TABLE "usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"ip_hash" text,
	"action" text NOT NULL,
	"tier_at_time" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "usage_event_user_id_created_at_idx" ON "usage_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_event_ip_hash_created_at_idx" ON "usage_event" USING btree ("ip_hash","created_at");