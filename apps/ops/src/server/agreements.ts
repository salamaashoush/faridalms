import type { Agreement } from "@faridalms/domain/agreements";

import {
  AgreementError,
  agreementsInForce,
  agreementVersionOf,
  insertAcceptance,
  publishAgreementVersion,
  recordAcceptance,
} from "@faridalms/database/business/agreements";
import { customerById } from "@faridalms/database/business/customers";
import { profile } from "@faridalms/database/business/profile";
import {
  ACCEPTANCE_LINK_DAYS,
  AGREEMENT_NAMES,
  agreementAcceptanceSchema,
  agreementDigest,
  AGREEMENTS,
  agreementVersionSchema,
} from "@faridalms/domain/agreements";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea } from "./access";
import { businessDb, requireBusiness } from "./business";
import { opsEnv } from "./env";
import { consoleMail } from "./mail";
import { agreementsAcceptedEmail, agreementsEmail } from "./offer-mail";
import { requestOrigin } from "./origin";
import { seal, unseal } from "./seal";

type Outcome = { ok: true } | { ok: false; message: string };

const uuid = v.pipe(v.string(), v.uuid());
const MAX_ATTACHMENT = 10 * 1024 * 1024;
const ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);
const REQUEST_PURPOSE = "agreements";
const requestToken = v.object({ customerId: uuid, contactId: uuid });

/** The link that reads a published version, which emails and pages give. */
export const agreementPath = (kind: Agreement, version: string) =>
  `/legal/${kind}/${encodeURIComponent(version)}`;

/** Publishes a version of the terms or the data processing agreement. */
export const publishAgreement = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof agreementVersionSchema>) =>
    v.parse(agreementVersionSchema, input),
  )
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("settings");
    try {
      await publishAgreementVersion(requireBusiness(), {
        ...data,
        digest: await agreementDigest(data),
        by: operator.id,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof AgreementError && error.code === "exists")
        return {
          ok: false,
          message: `Version ${data.version} is published already. A change is a new version.`,
        };
      throw error;
    }
  });

/**
 * Records an acceptance on paper: the version the customer signed, who
 * signed it, and the signed copy.
 */
export const recordPaperAcceptance = createServerFn({ method: "POST" })
  .validator((input: FormData) => {
    const fields = v.parse(
      v.object({
        customerId: uuid,
        kind: v.picklist(AGREEMENTS),
        version: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
        signerName: v.pipe(
          v.string(),
          v.trim(),
          v.minLength(1),
          v.maxLength(200),
        ),
        signerTitle: v.pipe(
          v.string(),
          v.trim(),
          v.maxLength(120),
          v.transform((value) => value || null),
        ),
      }),
      Object.fromEntries(
        ["customerId", "kind", "version", "signerName", "signerTitle"].map(
          (key) => [key, input.get(key) ?? ""],
        ),
      ),
    );
    const file = input.get("attachment");
    return { ...fields, file: file instanceof File ? file : null };
  })
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("customers");
    const { file } = data;
    if (!file || !ATTACHMENT_TYPES.has(file.type))
      return {
        ok: false,
        message: "Attach the signed copy as a PDF or an image.",
      };
    if (file.size === 0 || file.size > MAX_ATTACHMENT)
      return { ok: false, message: "Attach a file of up to 10 MB." };
    const db = requireBusiness();
    const version = await agreementVersionOf(db, data.kind, data.version);
    if (!version)
      return {
        ok: false,
        message: "That version is not published. Publish it in Settings first.",
      };
    await recordAcceptance(db, {
      customerId: data.customerId,
      versionId: version.id,
      method: "paper",
      signer: { name: data.signerName, title: data.signerTitle, email: null },
      ip: null,
      userAgent: null,
      attachment: {
        name: file.name.slice(0, 200),
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
      recordedBy: operator.id,
    });
    return { ok: true };
  });

const sendInput = v.object({
  customerId: uuid,
  contactIds: v.pipe(v.array(uuid), v.minLength(1), v.maxLength(20)),
});

/**
 * Emails each contact chosen a link of their own to read and accept the
 * agreements in force that the customer has not accepted at that version.
 */
export const sendForAcceptance = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof sendInput>) =>
    v.parse(sendInput, input),
  )
  .handler(async ({ data }): Promise<Outcome & { sent?: number }> => {
    const { operator } = await requireArea("customers");
    const db = requireBusiness();
    const mail = consoleMail();
    if (!mail)
      return {
        ok: false,
        message:
          "The console sends no email: set RESEND_API_KEY and EMAIL_FROM.",
      };
    const [found, business, inForce] = await Promise.all([
      customerById(db, data.customerId),
      profile(db),
      agreementsInForce(db, businessToday()),
    ]);
    if (!found) return { ok: false, message: "No such customer." };
    if (!business)
      return {
        ok: false,
        message: "Set the business's legal details in Settings first.",
      };
    const due = AGREEMENTS.filter((kind) => {
      const version = inForce[kind];
      const held =
        kind === "terms"
          ? found.customer.termsVersion
          : found.customer.dpaVersion;
      return version && held !== version.version;
    });
    if (due.length === 0)
      return {
        ok: false,
        message: AGREEMENTS.some((kind) => !inForce[kind])
          ? "Publish the terms and the data processing agreement in Settings first."
          : "It has accepted the versions in force already.",
      };
    const people = found.contacts.filter(
      (contact) => data.contactIds.includes(contact.id) && contact.email,
    );
    if (people.length === 0)
      return { ok: false, message: "Choose a contact with an email address." };
    const expires =
      Math.floor(Date.now() / 1000) + ACCEPTANCE_LINK_DAYS * 24 * 60 * 60;
    for (const contact of people) {
      if (!contact.email) continue;
      const token = seal(
        REQUEST_PURPOSE,
        { customerId: found.customer.id, contactId: contact.id },
        expires,
      );
      await mail.send(
        agreementsEmail({
          language: contact.locale,
          to: { name: contact.name, email: contact.email },
          customer:
            contact.locale === "ar"
              ? (found.customer.legalNameAr ?? found.customer.legalNameEn)
              : found.customer.legalNameEn,
          agreements: due.map((kind) => AGREEMENT_NAMES[kind][contact.locale]),
          link: `${opsEnv().OPS_ORIGIN}/agree/${token}`,
          business: {
            name:
              contact.locale === "ar"
                ? business.legalNameAr
                : business.legalNameEn,
            email: business.email,
          },
        }),
      );
    }
    console.info(
      JSON.stringify({
        worker: "agreements",
        customerId: found.customer.id,
        sentBy: operator.id,
        sent: people.length,
      }),
    );
    return { ok: true, sent: people.length };
  });

/** What a contact's link asks them to accept, or null once it no longer stands. */
async function requestOf(token: string) {
  const db = businessDb();
  const held = unseal(REQUEST_PURPOSE, token, requestToken);
  if (!db || !held) return null;
  const [found, business, inForce] = await Promise.all([
    customerById(db, held.customerId),
    profile(db),
    agreementsInForce(db, businessToday()),
  ]);
  const contact = found?.contacts.find((one) => one.id === held.contactId);
  if (!found || !contact || !business) return null;
  const due = AGREEMENTS.flatMap((kind) => {
    const version = inForce[kind];
    const accepted =
      kind === "terms"
        ? found.customer.termsVersion
        : found.customer.dpaVersion;
    return version && accepted !== version.version ? [{ kind, version }] : [];
  });
  return { db, customer: found.customer, contact, business, due };
}

/** The page a contact's link opens: who asks, for whom, and what to accept. */
export const getAgreementRequest = createServerFn({ method: "GET" })
  .validator((input: { token: string }) =>
    v.parse(v.object({ token: v.pipe(v.string(), v.maxLength(2000)) }), input),
  )
  .handler(async ({ data }) => {
    const request = await requestOf(data.token);
    if (!request) return null;
    const { customer, contact, business, due } = request;
    return {
      locale: contact.locale,
      contact: { name: contact.name, email: contact.email },
      customer: { nameEn: customer.legalNameEn, nameAr: customer.legalNameAr },
      business: { nameEn: business.legalNameEn, nameAr: business.legalNameAr },
      due: due.map(({ kind, version }) => ({
        kind,
        version: version.version,
        effectiveOn: version.effectiveOn,
        path: agreementPath(kind, version.version),
      })),
    };
  });

const acceptInput = v.object({
  token: v.pipe(v.string(), v.maxLength(2000)),
  acceptance: agreementAcceptanceSchema,
});

/** A contact accepts, through their link, every agreement it put before them. */
export const acceptAgreementsByLink = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof acceptInput>) =>
    v.parse(acceptInput, input),
  )
  .handler(async ({ data }): Promise<Outcome> => {
    const request = await requestOf(data.token);
    if (!request)
      return {
        ok: false,
        message: "This link no longer stands. Ask us for a new one.",
      };
    const { db, customer, contact, business, due } = request;
    if (due.length === 0) return { ok: true };
    const origin = requestOrigin();
    await db.transaction(async (tx) => {
      for (const { version } of due)
        await insertAcceptance(tx, {
          customerId: customer.id,
          versionId: version.id,
          method: "link",
          signer: data.acceptance.signer,
          ip: origin.ip,
          userAgent: origin.userAgent,
          attachment: null,
          recordedBy: null,
        });
    });
    const mail = consoleMail();
    if (mail)
      await mail
        .send(
          agreementsAcceptedEmail({
            language: contact.locale,
            to: {
              name: data.acceptance.signer.name,
              email: data.acceptance.signer.email,
            },
            customer:
              contact.locale === "ar"
                ? (customer.legalNameAr ?? customer.legalNameEn)
                : customer.legalNameEn,
            agreements: due.map(
              ({ kind }) => AGREEMENT_NAMES[kind][contact.locale],
            ),
            business: {
              name:
                contact.locale === "ar"
                  ? business.legalNameAr
                  : business.legalNameEn,
              email: business.email,
            },
          }),
        )
        .catch((error: unknown) =>
          console.error(
            JSON.stringify({
              worker: "agreements",
              customerId: customer.id,
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
    return { ok: true };
  });

/** A published version's words, for its public reading page. */
export const getAgreementText = createServerFn({ method: "GET" })
  .validator((input: { kind: string; version?: string }) =>
    v.parse(
      v.object({
        kind: v.pipe(v.string(), v.maxLength(10)),
        version: v.optional(v.pipe(v.string(), v.maxLength(40))),
      }),
      input,
    ),
  )
  .handler(async ({ data }) => {
    const db = businessDb();
    const kind = AGREEMENTS.find((one) => one === data.kind);
    if (!db || !kind) return null;
    const version = data.version
      ? await agreementVersionOf(db, kind, data.version)
      : (await agreementsInForce(db, businessToday()))[kind];
    const business = await profile(db);
    if (!version) return null;
    return {
      kind: version.kind,
      version: version.version,
      effectiveOn: version.effectiveOn,
      bodyEn: version.bodyEn,
      bodyAr: version.bodyAr,
      digest: version.digest,
      business: business
        ? { nameEn: business.legalNameEn, nameAr: business.legalNameAr }
        : null,
    };
  });
