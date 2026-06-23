CREATE TABLE "subscription" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"provider_id" text,
	"current_period_end" timestamp
);
