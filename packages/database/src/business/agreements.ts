import type {
  AcceptanceMethod,
  Agreement,
  AgreementVersionInput,
} from "@faridalms/domain/agreements";

import { CUSTOMER_LINK_ACTOR } from "@faridalms/domain/agreements";
import { and, desc, eq, lte } from "drizzle-orm";

import type { BusinessDb, BusinessTx } from "./client";

import { recordEvent } from "./events";
import { agreementAcceptances, agreementVersions, customers } from "./schema";

export type AgreementVersionRow = typeof agreementVersions.$inferSelect;

export class AgreementError extends Error {
  constructor(readonly code: "exists" | "not_found") {
    super(code);
    this.name = "AgreementError";
  }
}

/** Publishes a version of an agreement, written once, with its words' digest. */
export async function publishAgreementVersion(
  db: BusinessDb,
  input: AgreementVersionInput & { digest: string; by: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [taken] = await tx
      .select({ id: agreementVersions.id })
      .from(agreementVersions)
      .where(
        and(
          eq(agreementVersions.kind, input.kind),
          eq(agreementVersions.version, input.version),
        ),
      );
    if (taken) throw new AgreementError("exists");
    const [created] = await tx
      .insert(agreementVersions)
      .values({
        kind: input.kind,
        version: input.version,
        effectiveOn: input.effectiveOn,
        bodyEn: input.bodyEn,
        bodyAr: input.bodyAr,
        digest: input.digest,
        publishedBy: input.by,
      })
      .returning({ id: agreementVersions.id });
    if (!created) throw new Error("agreement version was not created");
    await recordEvent(tx, {
      operatorId: input.by,
      action: "agreement.publish",
      subjectType: "agreement_version",
      subjectId: created.id,
      after: {
        kind: input.kind,
        version: input.version,
        effectiveOn: input.effectiveOn,
        digest: input.digest,
      },
      reason: input.reason,
    });
    return created.id;
  });
}

/** Every published version, newest first, without their words. */
export async function listAgreementVersions(db: BusinessDb) {
  return db
    .select({
      id: agreementVersions.id,
      kind: agreementVersions.kind,
      version: agreementVersions.version,
      effectiveOn: agreementVersions.effectiveOn,
      digest: agreementVersions.digest,
      publishedAt: agreementVersions.publishedAt,
      publishedBy: agreementVersions.publishedBy,
    })
    .from(agreementVersions)
    .orderBy(
      desc(agreementVersions.effectiveOn),
      desc(agreementVersions.publishedAt),
    );
}

export async function agreementVersionOf(
  db: BusinessDb | BusinessTx,
  kind: Agreement,
  version: string,
): Promise<AgreementVersionRow | null> {
  const [row] = await db
    .select()
    .from(agreementVersions)
    .where(
      and(
        eq(agreementVersions.kind, kind),
        eq(agreementVersions.version, version),
      ),
    );
  return row ?? null;
}

/**
 * The version of each agreement in force on a day: the one that took
 * effect latest by then. Null for one never published.
 */
export async function agreementsInForce(
  db: BusinessDb | BusinessTx,
  day: string,
): Promise<Record<Agreement, AgreementVersionRow | null>> {
  const latest = async (kind: Agreement) => {
    const [row] = await db
      .select()
      .from(agreementVersions)
      .where(
        and(
          eq(agreementVersions.kind, kind),
          lte(agreementVersions.effectiveOn, day),
        ),
      )
      .orderBy(
        desc(agreementVersions.effectiveOn),
        desc(agreementVersions.publishedAt),
      )
      .limit(1);
    return row ?? null;
  };
  const [terms, dpa] = await Promise.all([latest("terms"), latest("dpa")]);
  return { terms, dpa };
}

export interface AcceptanceInput {
  customerId: string;
  versionId: string;
  method: AcceptanceMethod;
  signer: { name: string; title: string | null; email: string | null };
  /** Where a link's acceptance came from. */
  ip: string | null;
  userAgent: string | null;
  /** The signed copy an operator recorded a paper acceptance with. */
  attachment: { name: string; type: string; bytes: Uint8Array } | null;
  /** The operator who recorded it on paper; null when it came by link. */
  recordedBy: string | null;
}

/**
 * Records a customer's acceptance of an agreement version in the caller's
 * transaction, with its evidence, and makes it the version the customer
 * holds; logged as the customer's.
 */
export async function insertAcceptance(
  tx: BusinessTx,
  input: AcceptanceInput,
): Promise<void> {
  const [version] = await tx
    .select({
      kind: agreementVersions.kind,
      version: agreementVersions.version,
    })
    .from(agreementVersions)
    .where(eq(agreementVersions.id, input.versionId));
  if (!version) throw new AgreementError("not_found");
  const [accepted] = await tx
    .insert(agreementAcceptances)
    .values({
      customerId: input.customerId,
      versionId: input.versionId,
      method: input.method,
      signerName: input.signer.name,
      signerTitle: input.signer.title,
      signerEmail: input.signer.email,
      ip: input.ip,
      userAgent: input.userAgent,
      attachmentName: input.attachment?.name ?? null,
      attachmentType: input.attachment?.type ?? null,
      attachment: input.attachment ? Buffer.from(input.attachment.bytes) : null,
      recordedBy: input.recordedBy,
    })
    .returning({ acceptedAt: agreementAcceptances.acceptedAt });
  if (!accepted) throw new Error("acceptance was not recorded");
  await tx
    .update(customers)
    .set(
      version.kind === "terms"
        ? {
            termsVersion: version.version,
            termsAcceptedAt: accepted.acceptedAt,
          }
        : { dpaVersion: version.version, dpaAcceptedAt: accepted.acceptedAt },
    )
    .where(eq(customers.id, input.customerId));
  await recordEvent(tx, {
    operatorId: input.recordedBy ?? CUSTOMER_LINK_ACTOR,
    action: version.kind === "terms" ? "customer.terms" : "customer.dpa",
    subjectType: "customer",
    subjectId: input.customerId,
    after: {
      version: version.version,
      method: input.method,
      signer: input.signer.name,
      acceptedAt: accepted.acceptedAt.toISOString(),
    },
  });
}

/** Records one acceptance on its own. */
export async function recordAcceptance(
  db: BusinessDb,
  input: AcceptanceInput,
): Promise<void> {
  await db.transaction((tx) => insertAcceptance(tx, input));
}

/** Every acceptance a customer gave, newest first, without the signed copies. */
export async function acceptancesOf(db: BusinessDb, customerId: string) {
  return db
    .select({
      id: agreementAcceptances.id,
      kind: agreementVersions.kind,
      version: agreementVersions.version,
      method: agreementAcceptances.method,
      signerName: agreementAcceptances.signerName,
      signerTitle: agreementAcceptances.signerTitle,
      signerEmail: agreementAcceptances.signerEmail,
      ip: agreementAcceptances.ip,
      attachmentName: agreementAcceptances.attachmentName,
      recordedBy: agreementAcceptances.recordedBy,
      acceptedAt: agreementAcceptances.acceptedAt,
    })
    .from(agreementAcceptances)
    .innerJoin(
      agreementVersions,
      eq(agreementVersions.id, agreementAcceptances.versionId),
    )
    .where(eq(agreementAcceptances.customerId, customerId))
    .orderBy(desc(agreementAcceptances.acceptedAt));
}

/** The signed copy kept with a paper acceptance. */
export async function acceptanceAttachment(db: BusinessDb, id: string) {
  const [row] = await db
    .select({
      name: agreementAcceptances.attachmentName,
      type: agreementAcceptances.attachmentType,
      bytes: agreementAcceptances.attachment,
      customerId: agreementAcceptances.customerId,
    })
    .from(agreementAcceptances)
    .where(eq(agreementAcceptances.id, id));
  return row?.bytes && row.name && row.type
    ? {
        name: row.name,
        type: row.type,
        bytes: row.bytes,
        customerId: row.customerId,
      }
    : null;
}
