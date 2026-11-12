import type { OwnershipViolations } from "./ownership";

/**
 * Keys, namespace columns and concept columns that reach a module their
 * table's owner may not, by the module reached. `bun run db:verify` fails
 * on a violation missing here and on an entry that no longer occurs, so the
 * list only shrinks; each group stays sorted.
 */
export const OWNERSHIP_VIOLATIONS: OwnershipViolations = {
  families: [
    "core.admission_applications: family_user_id -> families",
    "core.consent_records: consent_records_tenant_id_relationship_id_fkey -> core.user_relationships",
    "core.consent_records: relationship_id -> families",
    "core.site_enquiries: family_user_id -> families",
    "core.users: custody_alert -> families",
    "health.requested_changes: relationship_id -> families",
    "health.requested_changes: requested_changes_tenant_id_relationship_id_fkey -> core.user_relationships",
  ],
  website: [
    "core.broadcasts: broadcasts_tenant_id_category_id_fkey -> core.site_categories",
  ],
  sso: [
    "core.login_identities: login_identities_tenant_id_identity_provider_id_fkey -> core.identity_providers",
  ],
};
