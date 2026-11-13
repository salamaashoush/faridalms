import type { SQL } from "bun";

import { DEFAULT_LIMITS } from "@faridalms/domain/plans";

import type { SeededTenant } from "../seed";

/**
 * Registers seeded tenants and their schools in the directory, with the
 * change rows every directory write carries. The connection must be the
 * operator's role, directory_admin.
 */
export async function registerTenants(
  directory: SQL,
  tenants: SeededTenant[],
  cell: { id: string; appHost: string; apiBaseUrl: string },
) {
  await directory.begin(async (tx) => {
    await tx`insert into cells (id, jurisdiction, provider, region, app_host, api_base_url, state)
      values (${cell.id}, 'EG', 'local', 'local', ${cell.appHost}, ${cell.apiBaseUrl}, 'open')
      on conflict (id) do nothing`;
    for (const tenant of tenants) {
      await tx`insert into tenants (id, kind, name_en, name_ar, cell_id, jurisdictions, state)
        values (${tenant.tenantId}, ${tenant.spec.kind}, ${tenant.spec.nameEn ?? null},
          ${tenant.spec.nameAr ?? null}, ${cell.id}, ${`{${tenant.spec.jurisdictions.join(",")}}`}::text[], 'active')`;
      for (const school of tenant.schools) {
        await tx`insert into schools (id, tenant_id, slug, name_en, name_ar, placement)
          values (${school.id}, ${tenant.tenantId}, ${school.slug}, ${school.nameEn}, ${school.nameAr}, 'cell')`;
        await tx`insert into school_entitlements (school_id, modules, pool_bytes, class_bytes,
            module_bytes, person_bytes)
          values (${school.id}, ${`{${school.modules.join(",")}}`}::text[], ${DEFAULT_LIMITS.poolBytes},
            ${DEFAULT_LIMITS.classBytes}, ${DEFAULT_LIMITS.moduleBytes}, ${DEFAULT_LIMITS.personBytes})`;
      }
      await tx`insert into changes (actor, subject_type, subject_id, action, after, reason)
        values (${`cell:${cell.id}`}, 'tenant', ${tenant.tenantId}, 'tenant.create',
          ${JSON.stringify({ schools: tenant.schools.map((school) => school.slug) })}::text::jsonb,
          'Development seed')`;
    }
  });
}
