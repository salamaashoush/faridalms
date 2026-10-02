import type { Descriptor } from "@faridalms/database/stores/descriptors";
import type {
  IdentifierRow,
  IdentifierValue,
} from "@faridalms/database/stores/identifiers";

import {
  decryptField,
  encryptField,
  lookupHmac,
} from "@faridalms/database/crypto";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  identifierById,
  identifiersOf,
  insertIdentifier,
  removeIdentifier,
  updateIdentifier,
} from "@faridalms/database/stores/identifiers";
import { isVisibleStudent, person } from "@faridalms/database/stores/students";
import {
  egyptianIdFacts,
  identifierRefSchema,
  isSealed,
  normaliseIdentifier,
  saveIdentifierSchema,
  SYSTEM_KEPT_MEANINGS,
} from "@faridalms/domain/identifiers";
import { addDays } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

const id = v.pipe(v.string(), v.uuid());

const cipher = (context: UnitContext, rowId: string, keyVersion: number) => ({
  tenantId: context.tenantId,
  table: "core.external_ids",
  column: "identifier_ciphertext",
  rowId,
  keyVersion,
});

async function requireStudent(context: UnitContext, studentId: string) {
  const visible = await isVisibleStudent(
    context.tx,
    {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      today: context.today,
      viewerId: context.actor.userId,
      schoolWide: can(context, "people:manage"),
    },
    studentId,
  );
  if (!visible) throw new ORPCError("NOT_FOUND");
}

/** The kinds of number the office keeps on a record, as this school labels them. */
async function systemsOf(context: UnitContext): Promise<Descriptor[]> {
  const all = await descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "external_id_system",
    today: context.today,
  });
  return all.filter(
    (row) =>
      !(SYSTEM_KEPT_MEANINGS as readonly string[]).includes(row.meaning ?? ""),
  );
}

/**
 * A number as it is stored: an identity document's sealed under the
 * tenant's identifiers key with a keyed hash for exact lookup, anything else
 * as typed. A national ID keeps no last digits, since they say too much.
 */
async function valueOf(
  context: UnitContext,
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
        cipher(context, input.rowId, key.version),
      ),
      hmac: await lookupHmac(lookup.key, normalised),
      keyVersion: key.version,
      last4: input.meaning === "national_id" ? null : normalised.slice(-4),
    },
  };
}

/** A stored number carried over unchanged when only its dates or issuer change. */
function kept(row: IdentifierRow): IdentifierValue {
  if (row.ciphertext && row.keyVersion !== null)
    return {
      identifier: null,
      sealed: {
        ciphertext: row.ciphertext,
        hmac: row.hmac ?? new Uint8Array(),
        keyVersion: row.keyVersion,
        last4: row.last4,
      },
    };
  return { identifier: row.identifier ?? "", sealed: null };
}

const masked = (row: IdentifierRow) =>
  row.ciphertext ? (row.last4 ? `•••• ${row.last4}` : "••••••••") : null;

/**
 * A student's identity documents and other systems' numbers. Document
 * numbers come masked; revealing one is its own audited request.
 */
export const list = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "identifiers:read");
    await requireStudent(context, input.studentId);
    const [rows, systems] = await Promise.all([
      identifiersOf(context.tx, {
        tenantId: context.tenantId,
        userId: input.studentId,
        except: SYSTEM_KEPT_MEANINGS,
      }),
      systemsOf(context),
    ]);
    return {
      rows: rows.map((row) => ({
        id: row.id,
        version: row.version,
        systemId: row.systemId,
        meaning: row.meaning,
        sealed: row.ciphertext !== null,
        shown: row.identifier ?? masked(row),
        issuingCountry: row.issuingCountry,
        from: row.from,
        expiresOn: row.to ? addDays(row.to, -1) : null,
      })),
      systems: systems.map((row) => ({
        id: row.id,
        meaning: row.meaning,
        labelEn: row.labelEn,
        labelAr: row.labelAr,
        sealed: isSealed(row.meaning),
      })),
      today: context.today,
      canReveal: can(context, "identifiers:read"),
      canWrite: can(context, "people:manage"),
    };
  });

/** One document number in full, for someone who holds identifiers:read; each look is recorded. */
export const reveal = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "identifiers:read");
    const row = await identifierById(context.tx, {
      tenantId: context.tenantId,
      id: input.id,
    });
    if (!row) throw new ORPCError("NOT_FOUND");
    await requireStudent(context, row.userId);
    if (!row.ciphertext || row.keyVersion === null)
      return { number: row.identifier ?? "" };
    const key = await context.keys.version(
      context.tx,
      context.tenantId,
      "identifiers",
      row.keyVersion,
    );
    const number = await decryptField(
      key.key,
      row.ciphertext,
      cipher(context, row.id, row.keyVersion),
    );
    await audit(context, {
      action: "external_id.reveal",
      objectType: "external_id",
      objectId: row.id,
      subjectUserId: row.userId,
      studentUserId: row.userId,
      details: { meaning: row.meaning },
    });
    return { number };
  });

/**
 * Adds or corrects a number. A renewed passport is a new row beside the old
 * one, so the record keeps which document was valid when.
 */
export const save = writeProcedure
  .input(saveIdentifierSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    await requireStudent(context, input.studentId);
    const system = (await systemsOf(context)).find(
      (row) => row.id === input.systemId,
    );
    if (!system?.meaning) throw new ORPCError("NOT_FOUND");
    const meaning = system.meaning;
    const egyptian =
      meaning === "national_id" &&
      (input.issuingCountry === "EG" || input.issuingCountry === "");
    const facts =
      egyptian && input.number ? egyptianIdFacts(input.number) : null;
    if (
      meaning === "national_id" &&
      input.issuingCountry === "EG" &&
      input.number &&
      !facts
    )
      throw new ORPCError("BAD_REQUEST", { message: "identifiers.egypt" });
    const rowId = input.id || Bun.randomUUIDv7();
    const existing = input.id
      ? await identifierById(context.tx, {
          tenantId: context.tenantId,
          id: input.id,
        })
      : null;
    if (
      input.id &&
      (!existing ||
        existing.userId !== input.studentId ||
        existing.systemId !== system.id)
    )
      throw new ORPCError("NOT_FOUND");
    const value: IdentifierValue =
      existing && input.number === ""
        ? kept(existing)
        : await valueOf(context, { rowId, meaning, number: input.number });
    const from = input.validFrom || context.today;
    const to = input.expiresOn ? addDays(input.expiresOn, 1) : null;
    if (to !== null && to <= from)
      throw new ORPCError("BAD_REQUEST", { message: "identifiers.dates" });
    const issuingCountry = input.issuingCountry || (facts ? "EG" : null);
    let version: number;
    if (input.id) {
      const next = await updateIdentifier(context.tx, {
        tenantId: context.tenantId,
        id: input.id,
        expectedVersion: input.expectedVersion,
        value,
        issuingCountry,
        from,
        to,
      });
      if (next === null)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      version = next;
    } else
      version = await insertIdentifier(context.tx, {
        tenantId: context.tenantId,
        id: rowId,
        userId: input.studentId,
        systemId: system.id,
        meaning,
        value,
        issuingCountry,
        assigningOrgId: null,
        from,
        to,
      });
    await audit(context, {
      action: input.id ? "external_id.update" : "external_id.create",
      objectType: "external_id",
      objectId: rowId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { meaning, issuingCountry, expiresOn: input.expiresOn || null },
    });
    // An Egyptian ID carries its holder's birth date; one that disagrees
    // with the record means one of the two is wrong.
    const student = facts ? await person(context.tx, input.studentId) : null;
    return {
      id: rowId,
      version,
      birthDateDiffers:
        facts !== null &&
        student?.birthDate !== null &&
        student?.birthDate !== undefined &&
        student.birthDate !== facts.birthDate,
    };
  });

export const remove = writeProcedure
  .input(identifierRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    const row = await identifierById(context.tx, {
      tenantId: context.tenantId,
      id: input.id,
    });
    if (
      !row ||
      (SYSTEM_KEPT_MEANINGS as readonly string[]).includes(row.meaning)
    )
      throw new ORPCError("NOT_FOUND");
    await requireStudent(context, row.userId);
    if (
      !(await removeIdentifier(context.tx, {
        tenantId: context.tenantId,
        ...input,
      }))
    )
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "external_id.remove",
      objectType: "external_id",
      objectId: row.id,
      subjectUserId: row.userId,
      studentUserId: row.userId,
      details: { meaning: row.meaning },
    });
    return { id: row.id };
  });
