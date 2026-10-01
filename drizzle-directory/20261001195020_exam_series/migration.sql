CREATE TABLE "exam_series" (
	"id" text PRIMARY KEY,
	"board" text NOT NULL,
	"sits_in" date NOT NULL,
	"keep_until" date NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "exam_series_id_check" CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
	CONSTRAINT "exam_series_board_check" CHECK (board in ('cambridge', 'pearson', 'ib', 'jcq')),
	CONSTRAINT "exam_series_sits_in_check" CHECK (extract(day from sits_in) = 1),
	CONSTRAINT "exam_series_keep_until_check" CHECK (keep_until > sits_in)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "exam_series_board_sits_in_key" ON "exam_series" ("board","sits_in");--> statement-breakpoint
ALTER TABLE "changes" DROP CONSTRAINT "changes_subject_type_check", ADD CONSTRAINT "changes_subject_type_check" CHECK (subject_type in ('cell', 'tenant', 'school', 'host', 'sso_domain', 'integration_client', 'exam_series'));