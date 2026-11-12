DROP POLICY "tenant_isolation" ON "core"."lti_keys";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."lti_keys";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."lti_keys";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."lti_keys";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."lti_keys";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."lti_replays";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."lti_replays";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."lti_replays";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."lti_replays";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."lti_replays";--> statement-breakpoint
DROP POLICY "p_delete" ON "core"."lti_replays";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."lti_tools";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."lti_tools";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."lti_tools";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."lti_tools";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."lti_tools";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."lti_line_items";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."lti_line_items";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."lti_line_items";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."lti_line_items";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."lti_line_items";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."lti_scores";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."lti_scores";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."lti_scores";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."lti_scores";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."lti_scores";--> statement-breakpoint
DROP POLICY "p_erase_update" ON "core"."lti_scores";--> statement-breakpoint
DROP POLICY "p_erase_delete" ON "core"."lti_scores";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."xapi_statements";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."xapi_statements";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."xapi_statements";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."xapi_statements";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."xapi_statements";--> statement-breakpoint
DROP POLICY "p_erase_update" ON "core"."xapi_statements";--> statement-breakpoint
DROP POLICY "p_erase_delete" ON "core"."xapi_statements";--> statement-breakpoint
DROP POLICY "p_delete" ON "core"."xapi_statements";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."xapi_stores";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."xapi_stores";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."xapi_stores";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."xapi_stores";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."xapi_stores";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."cmi5_registrations";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."cmi5_registrations";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."cmi5_registrations";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."cmi5_registrations";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."cmi5_registrations";--> statement-breakpoint
DROP POLICY "p_erase_update" ON "core"."cmi5_registrations";--> statement-breakpoint
DROP POLICY "p_erase_delete" ON "core"."cmi5_registrations";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."cmi5_sessions";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."cmi5_sessions";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."cmi5_sessions";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."cmi5_sessions";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."cmi5_sessions";--> statement-breakpoint
DROP POLICY "p_erase_update" ON "core"."cmi5_sessions";--> statement-breakpoint
DROP POLICY "p_erase_delete" ON "core"."cmi5_sessions";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "core"."cmi5_states";--> statement-breakpoint
DROP POLICY "owner_all" ON "core"."cmi5_states";--> statement-breakpoint
DROP POLICY "p_select" ON "core"."cmi5_states";--> statement-breakpoint
DROP POLICY "p_insert" ON "core"."cmi5_states";--> statement-breakpoint
DROP POLICY "p_update" ON "core"."cmi5_states";--> statement-breakpoint
DROP POLICY "p_erase_update" ON "core"."cmi5_states";--> statement-breakpoint
DROP POLICY "p_erase_delete" ON "core"."cmi5_states";--> statement-breakpoint
ALTER TABLE "core"."lti_line_items" DROP CONSTRAINT "lti_line_items_tenant_id_tool_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."lti_scores" DROP CONSTRAINT "lti_scores_tenant_id_line_item_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."cmi5_sessions" DROP CONSTRAINT "cmi5_sessions_tenant_id_registration_id_fkey";--> statement-breakpoint
ALTER TABLE "core"."cmi5_states" DROP CONSTRAINT "cmi5_states_tenant_id_registration_id_fkey";--> statement-breakpoint
DROP TABLE "core"."lti_keys";--> statement-breakpoint
DROP TABLE "core"."lti_replays";--> statement-breakpoint
DROP TABLE "core"."lti_tools";--> statement-breakpoint
DROP TABLE "core"."lti_line_items";--> statement-breakpoint
DROP TABLE "core"."lti_scores";--> statement-breakpoint
DROP TABLE "core"."xapi_statements";--> statement-breakpoint
DROP TABLE "core"."xapi_stores";--> statement-breakpoint
DROP TABLE "core"."cmi5_registrations";--> statement-breakpoint
DROP TABLE "core"."cmi5_sessions";--> statement-breakpoint
DROP TABLE "core"."cmi5_states";--> statement-breakpoint
ALTER TABLE "core"."lessons" DROP CONSTRAINT "lessons_completion_check", ADD CONSTRAINT "lessons_completion_check" CHECK (completion in ('view', 'mark', 'quiz', 'score', 'reflection', 'watch'));