import type { BusinessDb } from "@faridalms/database/business/client";

import {
  acceptancesOf,
  agreementsInForce,
  listAgreementVersions,
} from "@faridalms/database/business/agreements";
import { businessToday } from "@faridalms/domain/subscriptions";

/**
 * What a customer's record shows of its agreements: every version
 * published, the one in force of each, and each acceptance it gave.
 */
export async function agreementStateOf(db: BusinessDb, customerId: string) {
  const [versions, inForce, acceptances] = await Promise.all([
    listAgreementVersions(db),
    agreementsInForce(db, businessToday()),
    acceptancesOf(db, customerId),
  ]);
  return {
    published: versions.map(({ kind, version, effectiveOn }) => ({
      kind,
      version,
      effectiveOn,
    })),
    inForce: {
      terms: inForce.terms?.version ?? null,
      dpa: inForce.dpa?.version ?? null,
    },
    acceptances,
  };
}

export type AgreementState = Awaited<ReturnType<typeof agreementStateOf>>;
