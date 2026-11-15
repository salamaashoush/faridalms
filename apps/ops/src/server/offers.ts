import type { Offer } from "@faridalms/domain/agreements";

import { agreementsInForce } from "@faridalms/database/business/agreements";
import { customerById } from "@faridalms/database/business/customers";
import { leadById } from "@faridalms/database/business/leads";
import { profile } from "@faridalms/database/business/profile";
import {
  acceptQuote,
  markQuoteSent,
  QuoteError,
  quoteById,
} from "@faridalms/database/business/quotes";
import {
  AGREEMENTS,
  CUSTOMER_LINK_ACTOR,
  offerAcceptanceSchema,
  offerSchema,
} from "@faridalms/domain/agreements";
import { quoteReference } from "@faridalms/domain/quotes";
import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import type { Operator } from "./session";

import { requireArea } from "./access";
import { agreementPath } from "./agreements";
import { businessDb, requireBusiness } from "./business";
import { directoryAdmin } from "./directory-admin";
import { opsEnv } from "./env";
import { consoleMail } from "./mail";
import { offerAcceptedEmail, offerEmail } from "./offer-mail";
import { requestOrigin } from "./origin";
import { draftOfQuote, quoteVatName } from "./quote-parts";
import { createDraftSchool } from "./school-setup";
import { seal, unseal } from "./seal";

type Outcome<T = object> =
  | ({ ok: true } & T)
  | { ok: false; message: string; field?: string };

const OFFER_PURPOSE = "offer";
const offerToken = v.object({
  quoteId: v.pipe(v.string(), v.uuid()),
  link: v.pipe(v.string(), v.uuid()),
});
const tokenSchema = v.pipe(v.string(), v.maxLength(2000));

/** Who the cells and the log are told acted, when a customer's acceptance creates its school. */
const CUSTOMER_LINK: Operator = {
  id: CUSTOMER_LINK_ACTOR,
  name: "The customer, through its link",
  email: null,
  authAt: 0,
};

/**
 * Sends a quote as an offer: an email to the person named with a link of
 * their own to read it with the terms and the data processing agreement,
 * and accept them. For a party with no school yet it names the school the
 * acceptance sets up. Sending again makes a new link and ends the old one.
 */
export const sendOffer = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof offerSchema>) =>
    v.parse(offerSchema, input),
  )
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("leads");
    const db = requireBusiness();
    const quote = await quoteById(db, data.quoteId);
    if (!quote) return { ok: false, message: "No such quote." };
    if (quote.state !== "draft" && quote.state !== "sent")
      return {
        ok: false,
        message: "It was accepted or superseded, so it is not sent again.",
      };
    const mail = consoleMail();
    const [business, inForce, customer] = await Promise.all([
      profile(db),
      agreementsInForce(db, businessToday()),
      quote.customerId ? customerById(db, quote.customerId) : null,
    ]);
    if (!mail)
      return {
        ok: false,
        message:
          "The console sends no email: set RESEND_API_KEY and EMAIL_FROM.",
      };
    if (!business)
      return {
        ok: false,
        message: "Set the business's legal details in Settings first.",
      };
    if (!inForce.terms || !inForce.dpa)
      return {
        ok: false,
        message:
          "Publish the terms and the data processing agreement in Settings first: the customer accepts them with the quote.",
      };
    const needsSchool = !customer?.customer.tenantId;
    if (needsSchool && !data.school)
      return {
        ok: false,
        field: "school",
        message: "Name the school its acceptance sets up.",
      };
    const school = needsSchool ? data.school : null;
    if (
      school &&
      (await directoryAdmin().schools()).some((one) => one.slug === school.slug)
    )
      return {
        ok: false,
        field: "slug",
        message: `Another school has ${school.slug}. Choose another address.`,
      };
    const offer: Offer = { link: crypto.randomUUID(), to: data.to, school };
    await markQuoteSent(db, { id: quote.id, by: operator.id, offer });
    // The link stands until the end of the quote's last day.
    const expires =
      Date.parse(`${addDays(quote.validUntil, 1)}T00:00:00Z`) / 1000;
    const token = seal(
      OFFER_PURPOSE,
      { quoteId: quote.id, link: offer.link },
      expires,
    );
    const language = data.to.locale;
    await mail.send(
      offerEmail({
        language,
        to: data.to,
        reference: quoteReference(quote.number, quote.version),
        currency: quote.currency,
        totalMinor: quote.totalMinor,
        validUntil: quote.validUntil,
        link: `${opsEnv().OPS_ORIGIN}/offer/${token}`,
        school: school
          ? ((language === "ar" ? school.nameAr : school.nameEn) ??
            school.nameEn ??
            school.nameAr)
          : null,
        business: {
          name: language === "ar" ? business.legalNameAr : business.legalNameEn,
          email: business.email,
        },
      }),
    );
    return { ok: true };
  });

/** The quote a link names, while the link is the one last sent. */
async function offerOf(token: string) {
  const db = businessDb();
  const held = unseal(OFFER_PURPOSE, token, offerToken);
  if (!db || !held) return null;
  const quote = await quoteById(db, held.quoteId);
  if (!quote?.offer || quote.offer.link !== held.link) return null;
  return { db, quote, offer: quote.offer };
}

/** What the customer's link opens: the quote, what to accept, and what to give. */
export const getOffer = createServerFn({ method: "GET" })
  .validator((input: { token: string }) =>
    v.parse(v.object({ token: tokenSchema }), input),
  )
  .handler(async ({ data }) => {
    const found = await offerOf(data.token);
    if (!found) return null;
    const { db, quote, offer } = found;
    const today = businessToday();
    const [business, inForce, lead, customer, vatName] = await Promise.all([
      profile(db),
      agreementsInForce(db, today),
      quote.leadId ? leadById(db, quote.leadId) : null,
      quote.customerId ? customerById(db, quote.customerId) : null,
      quoteVatName(quote),
    ]);
    if (!business) return null;
    const state =
      quote.state === "accepted"
        ? ("accepted" as const)
        : quote.state === "superseded"
          ? ("replaced" as const)
          : quote.validUntil < today
            ? ("expired" as const)
            : ("open" as const);
    return {
      state,
      locale: offer.to.locale,
      reference: quoteReference(quote.number, quote.version),
      quote,
      party: customer
        ? {
            name: customer.customer.legalNameEn,
            nameAr: customer.customer.legalNameAr,
            address: customer.customer.address,
            taxNumber: customer.customer.taxNumber,
          }
        : {
            name: lead?.lead.organisation ?? "",
            nameAr: null,
            address: null,
            taxNumber: null,
          },
      business,
      vatName,
      agreements: AGREEMENTS.flatMap((kind) => {
        const version = inForce[kind];
        return version
          ? [
              {
                kind,
                version: version.version,
                path: agreementPath(kind, version.version),
              },
            ]
          : [];
      }),
      school: offer.school,
      portalDomain: opsEnv().PORTAL_DOMAIN,
      prefill: {
        legalNameEn:
          customer?.customer.legalNameEn ?? lead?.lead.organisation ?? "",
        legalNameAr: customer?.customer.legalNameAr ?? "",
        taxNumber: customer?.customer.taxNumber ?? "",
        address: customer?.customer.address ?? "",
        signer: { name: offer.to.name, email: offer.to.email },
      },
      /** A customer already on record keeps its legal details as they are. */
      onRecord: customer !== null,
    };
  });

const acceptInput = v.object({
  token: tokenSchema,
  acceptance: offerAcceptanceSchema,
});

/**
 * The customer accepts the offer through its link: the quote with the
 * agreements in force, recorded with who signed and from where; its
 * customer, from its lead if it has none; and where the offer names the
 * school, the school created at once, its first administrator emailed a
 * link to sign in. A school that cannot be created is left complete in
 * New school for an operator to finish.
 */
export const acceptOffer = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof acceptInput>) =>
    v.parse(acceptInput, input),
  )
  .handler(async ({ data }): Promise<Outcome<{ created: boolean }>> => {
    const found = await offerOf(data.token);
    if (!found)
      return {
        ok: false,
        message: "This link no longer stands. Ask us for a new one.",
      };
    const { db, quote, offer } = found;
    const today = businessToday();
    if (quote.state !== "sent")
      return {
        ok: false,
        message:
          quote.state === "accepted"
            ? "It has been accepted already."
            : "A newer version replaced it. Ask us for its link.",
      };
    if (quote.validUntil < today)
      return {
        ok: false,
        message: "It is past its validity. Ask us for a new one.",
      };
    const { acceptance } = data;
    if (offer.school && !acceptance.administrator)
      return {
        ok: false,
        field: "administrator",
        message: "Give the school's first administrator.",
      };
    const [inForce, lead, business, cells] = await Promise.all([
      agreementsInForce(db, today),
      quote.leadId ? leadById(db, quote.leadId) : null,
      profile(db),
      directoryAdmin().openCells(),
    ]);
    if (!inForce.terms || !inForce.dpa)
      return {
        ok: false,
        message: "It cannot be accepted just now. Ask us to send it again.",
      };
    const origin = requestOrigin();
    const setup =
      offer.school && acceptance.administrator
        ? {
            school: offer.school,
            locale: offer.to.locale,
            administrator: acceptance.administrator,
          }
        : null;
    let draftId: string;
    try {
      ({ draftId } = await acceptQuote(db, {
        id: quote.id,
        evidence: {
          kind: "link",
          signer: acceptance.signer,
          ip: origin.ip,
          userAgent: origin.userAgent,
          agreementVersionIds: [inForce.terms.id, inForce.dpa.id],
        },
        newCustomer: quote.customerId
          ? null
          : {
              legalNameEn: acceptance.legalNameEn,
              legalNameAr: acceptance.legalNameAr,
              taxNumber: acceptance.taxNumber,
              commercialRegistry: acceptance.commercialRegistry,
              address: acceptance.address,
              country: quote.country,
              contact: {
                name: acceptance.signer.name,
                email: acceptance.signer.email,
                phone: lead?.lead.phone ?? null,
                roles: ["decision_maker"],
                locale: offer.to.locale,
              },
            },
        draft: () =>
          draftOfQuote({
            quote,
            cellId: cells[0]?.id ?? "",
            schoolName: lead?.lead.organisation ?? null,
            setup,
          }),
        draftStep: setup ? "review" : "schools",
        by: CUSTOMER_LINK_ACTOR,
      }));
    } catch (error) {
      if (error instanceof QuoteError)
        return { ok: false, message: "It has been accepted already." };
      throw error;
    }
    let created = false;
    if (setup)
      try {
        const out = await createDraftSchool(CUSTOMER_LINK, draftId);
        created = out.ok;
        if (!out.ok)
          console.error(
            JSON.stringify({
              worker: "offer",
              quote: quote.number,
              draftId,
              refused: out.message,
            }),
          );
      } catch (error) {
        console.error(
          JSON.stringify({
            worker: "offer",
            quote: quote.number,
            draftId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    const mail = consoleMail();
    const language = offer.to.locale;
    if (mail && business)
      await mail
        .send(
          offerAcceptedEmail({
            language,
            to: {
              name: acceptance.signer.name,
              email: acceptance.signer.email,
            },
            reference: quoteReference(quote.number, quote.version),
            customer:
              language === "ar"
                ? (acceptance.legalNameAr ?? acceptance.legalNameEn)
                : acceptance.legalNameEn,
            administrator: created
              ? (acceptance.administrator?.email ?? null)
              : null,
            business: {
              name:
                language === "ar" ? business.legalNameAr : business.legalNameEn,
              email: business.email,
            },
          }),
        )
        .catch((error: unknown) =>
          console.error(
            JSON.stringify({
              worker: "offer",
              quote: quote.number,
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
    return { ok: true, created };
  });
