DROP POLICY "tenant_isolation" ON "core"."exam_boards";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."exam_boards";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."exam_boards";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."exam_boards";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."exam_boards";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."exam_sessions";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."exam_sessions";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."exam_sessions";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."exam_sessions";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."exam_sessions";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."attempt_authentications";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."attempt_authentications";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."attempt_authentications";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."attempt_authentications";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."attempt_authentications";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."attempt_declarations";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."attempt_declarations";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."attempt_declarations";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."attempt_declarations";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."attempt_declarations";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."coursework_assessments";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."coursework_assessments";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."coursework_assessments";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."coursework_assessments";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."coursework_assessments";--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" DROP CONSTRAINT "exam_sessions_tenant_id_board_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."coursework_assessments" DROP CONSTRAINT "coursework_assessments_tenant_id_session_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."programmes" DROP CONSTRAINT "programmes_tenant_id_board_id_fkey";--> statement-breakpoint
DROP TABLE "core"."exam_boards";--> statement-breakpoint
DROP TABLE "core"."exam_sessions";--> statement-breakpoint
DROP TABLE "core"."attempt_authentications";--> statement-breakpoint
DROP TABLE "core"."attempt_declarations";--> statement-breakpoint
DROP TABLE "core"."coursework_assessments";--> statement-breakpoint
ALTER TABLE "core"."programmes" DROP CONSTRAINT "programmes_official_board_check";--> statement-breakpoint
ALTER TABLE "core"."programmes" DROP CONSTRAINT "programmes_board_check";--> statement-breakpoint
ALTER TABLE "core"."programmes" DROP COLUMN "official_board";--> statement-breakpoint
ALTER TABLE "core"."programmes" DROP COLUMN "board_id";