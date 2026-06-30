CREATE TABLE "export_error" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"ip_hash" text,
	"tier_at_time" text NOT NULL,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "export_error_created_at_idx" ON "export_error" USING btree ("created_at");