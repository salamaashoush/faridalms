import type { DirectoryAdmin } from "@faridalms/database/directory/admin";
import type {
  NewSchool,
  ProvisionResult,
} from "@faridalms/domain/provisioning";

import { SlugTakenError } from "@faridalms/database/directory/admin";

import type { Operator } from "./session";

import { directoryAdmin } from "./directory-admin";
import { explain, provisionTenant } from "./provisioner";

/** Why a step of creating a school stopped, and the addresses at fault. */
export interface Refusal {
  ok: false;
  message: string;
  takenSlugs: string[];
}

/**
 * Writes a new tenant and its schools to the directory as provisioning.
 * Asked again with the same addresses it answers the same ids, so a failed
 * attempt is retried as it was.
 */
export async function beginSchool(
  operator: Operator,
  spec: NewSchool,
): Promise<{ ok: true; tenantId: string; schoolIds: string[] } | Refusal> {
  let begun: Awaited<ReturnType<DirectoryAdmin["beginTenant"]>>;
  try {
    begun = await directoryAdmin().beginTenant({
      tenantId: Bun.randomUUIDv7(),
      kind: spec.kind,
      nameEn: spec.nameEn,
      nameAr: spec.nameAr,
      cellId: spec.cellId,
      jurisdictions: spec.jurisdictions,
      schools: spec.schools.map((school) => ({
        id: Bun.randomUUIDv7(),
        slug: school.slug,
        nameEn: school.nameEn,
        nameAr: school.nameAr,
      })),
      entitlements: spec.entitlements,
      operatorId: operator.id,
    });
  } catch (error) {
    if (error instanceof SlugTakenError)
      return {
        ok: false,
        takenSlugs: error.slugs,
        message: error.pending
          ? "These addresses belong to a school still being created with other details. Submit it as it was first entered to finish it."
          : "Another school already has this address.",
      };
    if (error instanceof Error && error.message === "cell.not_open")
      return {
        ok: false,
        takenSlugs: [],
        message: "That cell is not open for new schools.",
      };
    throw error;
  }
  return { ok: true, tenantId: begun.tenantId, schoolIds: begun.schoolIds };
}

/** Has the cell create the tenant and email its administrators, or send again. */
export async function provisionSchool(
  operator: Operator,
  input: { tenantId: string; schoolIds: string[]; spec: NewSchool },
): Promise<{ ok: true; value: ProvisionResult } | Refusal> {
  const answer = await provisionTenant(operator, input);
  return answer.ok
    ? answer
    : {
        ok: false,
        takenSlugs: [],
        message: `${explain(answer)} The school stays in the directory as provisioning until it succeeds.`,
      };
}

/** Marks the tenant active in the directory; false when it could not yet. */
export const activateSchool = (operator: Operator, tenantId: string) =>
  directoryAdmin()
    .activateTenant({ tenantId, operatorId: operator.id })
    .then(
      () => true,
      () => false,
    );
