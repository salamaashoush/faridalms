import type { DraftSpec } from "@faridalms/domain/provisioning-draft";
import type {
  QuoteLine,
  QuoteSpec,
  QuoteTotals,
} from "@faridalms/domain/quotes";
import type { ContactRole } from "@faridalms/domain/subscriptions";

import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";

import type { BusinessDb } from "./client";

import { insertContact, insertCustomer } from "./customers";
import { insertDraft } from "./drafts";
import { recordEvent } from "./events";
import { leads, quotes } from "./schema";

/** A quote's fields, without its attachment's bytes. */
const summary = {
  id: quotes.id,
  number: quotes.number,
  version: quotes.version,
  leadId: quotes.leadId,
  customerId: quotes.customerId,
  state: quotes.state,
  spec: quotes.spec,
  lines: quotes.lines,
  currency: quotes.currency,
  country: quotes.country,
  vatPercent: quotes.vatPercent,
  subtotalMinor: quotes.subtotalMinor,
  vatMinor: quotes.vatMinor,
  totalMinor: quotes.totalMinor,
  validUntil: quotes.validUntil,
  sentAt: quotes.sentAt,
  acceptedAt: quotes.acceptedAt,
  acceptedBy: quotes.acceptedBy,
  attachmentName: quotes.attachmentName,
  attachmentType: quotes.attachmentType,
  draftId: quotes.draftId,
  createdBy: quotes.createdBy,
  createdAt: quotes.createdAt,
};

export type QuoteRow = {
  [K in keyof typeof summary]: (typeof quotes.$inferSelect)[K];
};

export class QuoteError extends Error {
  constructor(readonly code: "not_found" | "not_draft" | "not_open") {
    super(code);
    this.name = "QuoteError";
  }
}

/** A lead's or customer's quotes, newest first, every version. */
export function quotesFor(
  db: BusinessDb,
  party: { leadId?: string; customerId?: string },
): Promise<QuoteRow[]> {
  return db
    .select(summary)
    .from(quotes)
    .where(
      or(
        party.leadId ? eq(quotes.leadId, party.leadId) : undefined,
        party.customerId ? eq(quotes.customerId, party.customerId) : undefined,
      ),
    )
    .orderBy(desc(quotes.number), desc(quotes.version));
}

export async function quoteById(
  db: BusinessDb,
  id: string,
): Promise<QuoteRow | null> {
  const [row] = await db.select(summary).from(quotes).where(eq(quotes.id, id));
  return row ?? null;
}

/** The signed copy or purchase order kept with an accepted quote. */
export async function quoteAttachment(db: BusinessDb, id: string) {
  const [row] = await db
    .select({
      name: quotes.attachmentName,
      type: quotes.attachmentType,
      bytes: quotes.attachment,
    })
    .from(quotes)
    .where(eq(quotes.id, id));
  return row?.bytes && row.name && row.type
    ? { name: row.name, type: row.type, bytes: row.bytes }
    : null;
}

/** What a quote's content and amounts are, as computed from the catalogue. */
export interface QuoteContent {
  spec: QuoteSpec;
  lines: QuoteLine[];
  country: string;
  totals: QuoteTotals;
}

const amounts = (content: QuoteContent) => ({
  spec: content.spec,
  lines: content.lines,
  currency: content.spec.currency,
  country: content.country,
  vatPercent: String(content.totals.vatPercent),
  subtotalMinor: content.totals.subtotalMinor,
  vatMinor: content.totals.vatMinor,
  totalMinor: content.totals.totalMinor,
  validUntil: content.spec.validUntil,
});

/**
 * Writes a new quote numbered after the year's last, Q-2026-0001 and on;
 * numbers are given one at a time, so two quotes never share one.
 */
export async function createQuote(
  db: BusinessDb,
  input: QuoteContent & {
    leadId: string | null;
    customerId: string | null;
    year: string;
    by: string;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('quote_number', 0))`,
    );
    const prefix = `Q-${input.year}-`;
    const [last] = await tx
      .select({ number: quotes.number })
      .from(quotes)
      .where(sql`${quotes.number} like ${`${prefix}%`}`)
      .orderBy(desc(quotes.number))
      .limit(1);
    const next = Number(last?.number.slice(prefix.length) ?? "0") + 1;
    const number = `${prefix}${String(next).padStart(4, "0")}`;
    const [created] = await tx
      .insert(quotes)
      .values({
        ...amounts(input),
        number,
        leadId: input.leadId,
        customerId: input.customerId,
        createdBy: input.by,
      })
      .returning({ id: quotes.id });
    if (!created) throw new Error("quote was not created");
    await recordEvent(tx, {
      operatorId: input.by,
      action: "quote.create",
      subjectType: "quote",
      subjectId: created.id,
      after: { number, totalMinor: input.totals.totalMinor },
    });
    if (input.leadId) {
      const [moved] = await tx
        .update(leads)
        .set({ state: "proposal" })
        .where(
          and(
            eq(leads.id, input.leadId),
            inArray(leads.state, [
              "new",
              "contacted",
              "demo_booked",
              "demo_done",
            ]),
          ),
        )
        .returning({ id: leads.id });
      if (moved)
        await recordEvent(tx, {
          operatorId: input.by,
          action: "lead.state",
          subjectType: "lead",
          subjectId: input.leadId,
          after: { state: "proposal", quote: number },
        });
    }
    return created.id;
  });
}

/** Changes a quote not yet sent; a sent one gets a new version instead. */
export async function saveQuote(
  db: BusinessDb,
  input: QuoteContent & { id: string; by: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [saved] = await tx
      .update(quotes)
      .set(amounts(input))
      .where(and(eq(quotes.id, input.id), eq(quotes.state, "draft")))
      .returning({ id: quotes.id });
    if (!saved) throw new QuoteError("not_draft");
    await recordEvent(tx, {
      operatorId: input.by,
      action: "quote.update",
      subjectType: "quote",
      subjectId: input.id,
      after: { totalMinor: input.totals.totalMinor },
    });
  });
}

/**
 * A new version of a sent quote, with the content given, which supersedes
 * every version before it. Answers the new version's id.
 */
export async function reviseQuote(
  db: BusinessDb,
  input: QuoteContent & { id: string; by: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [held] = await tx
      .select({
        number: quotes.number,
        leadId: quotes.leadId,
        customerId: quotes.customerId,
        state: quotes.state,
      })
      .from(quotes)
      .where(eq(quotes.id, input.id))
      .for("update");
    if (!held) throw new QuoteError("not_found");
    if (held.state !== "sent") throw new QuoteError("not_open");
    const [last] = await tx
      .select({ version: quotes.version })
      .from(quotes)
      .where(eq(quotes.number, held.number))
      .orderBy(desc(quotes.version))
      .limit(1);
    await tx
      .update(quotes)
      .set({ state: "superseded" })
      .where(and(eq(quotes.number, held.number), ne(quotes.state, "accepted")));
    const [created] = await tx
      .insert(quotes)
      .values({
        ...amounts(input),
        number: held.number,
        version: (last?.version ?? 1) + 1,
        leadId: held.leadId,
        customerId: held.customerId,
        createdBy: input.by,
      })
      .returning({ id: quotes.id });
    if (!created) throw new Error("quote was not created");
    await recordEvent(tx, {
      operatorId: input.by,
      action: "quote.revise",
      subjectType: "quote",
      subjectId: created.id,
      after: { number: held.number, supersedes: input.id },
    });
    return created.id;
  });
}

export async function markQuoteSent(
  db: BusinessDb,
  input: { id: string; by: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [sent] = await tx
      .update(quotes)
      .set({ state: "sent", sentAt: new Date() })
      .where(and(eq(quotes.id, input.id), eq(quotes.state, "draft")))
      .returning({ id: quotes.id });
    if (!sent) throw new QuoteError("not_draft");
    await recordEvent(tx, {
      operatorId: input.by,
      action: "quote.send",
      subjectType: "quote",
      subjectId: input.id,
    });
  });
}

/**
 * Records a quote accepted, with the signed copy or purchase order, in one
 * transaction: the customer it is for, created from its lead if it has
 * none, the lead won, every other version superseded, and the school's
 * draft begun from it. Answers the customer and the draft.
 */
export async function acceptQuote(
  db: BusinessDb,
  input: {
    id: string;
    attachment: { name: string; type: string; bytes: Uint8Array };
    newCustomer: {
      legalNameEn: string;
      country: string;
      /** The lead's person, where it gave an email or a phone to reach them. */
      contact: {
        name: string;
        email: string | null;
        phone: string | null;
        roles: ContactRole[];
        locale: "en" | "ar";
      } | null;
    } | null;
    draft: (customerId: string) => DraftSpec;
    by: string;
  },
): Promise<{ customerId: string; draftId: string }> {
  return db.transaction(async (tx) => {
    const [held] = await tx
      .select({
        number: quotes.number,
        state: quotes.state,
        leadId: quotes.leadId,
        customerId: quotes.customerId,
        currency: quotes.currency,
      })
      .from(quotes)
      .where(eq(quotes.id, input.id))
      .for("update");
    if (!held) throw new QuoteError("not_found");
    if (held.state !== "draft" && held.state !== "sent")
      throw new QuoteError("not_open");
    let customerId = held.customerId;
    if (!customerId) {
      if (!input.newCustomer) throw new QuoteError("not_open");
      const [lead] = held.leadId
        ? await tx
            .select({ ownerId: leads.ownerId })
            .from(leads)
            .where(eq(leads.id, held.leadId))
        : [];
      customerId = await insertCustomer(tx, {
        legalNameEn: input.newCustomer.legalNameEn,
        legalNameAr: null,
        taxNumber: null,
        commercialRegistry: null,
        address: null,
        country: input.newCustomer.country,
        currency: held.currency,
        tenantId: null,
        accountOwnerId: lead?.ownerId ?? null,
        by: input.by,
        reason: `Accepted quote ${held.number}`,
      });
      if (input.newCustomer.contact)
        await insertContact(tx, {
          ...input.newCustomer.contact,
          customerId,
          by: input.by,
        });
    }
    const draftId = await insertDraft(tx, {
      spec: input.draft(customerId),
      customerId,
      step: "schools",
      by: input.by,
    });
    await tx
      .update(quotes)
      .set({ state: "superseded" })
      .where(and(eq(quotes.number, held.number), ne(quotes.id, input.id)));
    await tx
      .update(quotes)
      .set({
        state: "accepted",
        customerId,
        acceptedAt: new Date(),
        acceptedBy: input.by,
        sentAt: sql`coalesce(${quotes.sentAt}, statement_timestamp())`,
        attachmentName: input.attachment.name,
        attachmentType: input.attachment.type,
        attachment: Buffer.from(input.attachment.bytes),
        draftId,
      })
      .where(eq(quotes.id, input.id));
    if (held.leadId) {
      await tx
        .update(leads)
        .set({ state: "won", lostReason: null, customerId })
        .where(eq(leads.id, held.leadId));
      await recordEvent(tx, {
        operatorId: input.by,
        action: "lead.state",
        subjectType: "lead",
        subjectId: held.leadId,
        after: { state: "won", quote: held.number },
      });
    }
    await recordEvent(tx, {
      operatorId: input.by,
      action: "quote.accept",
      subjectType: "quote",
      subjectId: input.id,
      after: { number: held.number, customerId, draftId },
    });
    return { customerId, draftId };
  });
}
