import type { IdentifierValue } from "@faridalms/database/stores/identifiers";

import { encryptField, lookupHmac } from "@faridalms/database/crypto";
import { isSealed, normaliseIdentifier } from "@faridalms/domain/identifiers";

import type { UnitContext } from "./context";

export const identifierCipher = (
  context: Pick<UnitContext, "tenantId">,
  rowId: string,
  keyVersion: number,
) => ({
  tenantId: context.tenantId,
  table: "core.external_ids",
  column: "identifier_ciphertext",
  rowId,
  keyVersion,
});

/**
 * A number as it is stored: an identity document's sealed under the
 * tenant's identifiers key with a keyed hash for exact lookup, anything else
 * as typed. A national ID keeps no last digits, since they say too much.
 */
export async function identifierValue(
  context: Pick<UnitContext, "tenantId" | "tx" | "keys">,
  input: { rowId: string; meaning: string; number: string },
): Promise<IdentifierValue> {
  if (!isSealed(input.meaning))
    return { identifier: input.number, sealed: null };
  const normalised = normaliseIdentifier(input.number);
  const [key, lookup] = await Promise.all([
    context.keys.active(context.tx, context.tenantId, "identifiers"),
    context.keys.active(context.tx, context.tenantId, "identifier_lookup"),
  ]);
  return {
    identifier: null,
    sealed: {
      ciphertext: await encryptField(
        key.key,
        input.number,
        identifierCipher(context, input.rowId, key.version),
      ),
      hmac: await lookupHmac(lookup.key, normalised),
      keyVersion: key.version,
      last4: input.meaning === "national_id" ? null : normalised.slice(-4),
    },
  };
}
