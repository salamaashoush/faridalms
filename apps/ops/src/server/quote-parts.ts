import type { DraftSpec } from "@faridalms/domain/provisioning-draft";

import { listTaxRates } from "@faridalms/database/business/profile";
import type { quoteById } from "@faridalms/database/business/quotes";
import { rateOn } from "@faridalms/domain/business";
import { blankDraft } from "@faridalms/domain/provisioning-draft";

import { requireBusiness } from "./business";

/** A quote as the stores answer it. */
type QuoteRow = NonNullable<Awaited<ReturnType<typeof quoteById>>>;

/**
 * The school's draft a quote's acceptance begins: what was sold, on a
 * contract for its term, in the cell given; and where its offer named the
 * school and the customer its first administrator, those too, so it is
 * complete and can be created at once.
 */
export function draftOfQuote(input: {
  quote: QuoteRow;
  cellId: string;
  schoolName: string | null;
  setup: {
    school: { nameEn: string | null; nameAr: string | null; slug: string };
    locale: "en" | "ar";
    administrator: { givenName: string; familyName: string; email: string };
  } | null;
}): DraftSpec {
  const { quote, setup } = input;
  const spec = quote.spec;
  const draft = blankDraft({
    cellId: input.cellId,
    trialEndsOn: spec.termStartsOn,
  });
  const administrator = setup?.administrator;
  return {
    ...draft,
    tenant: {
      ...draft.tenant,
      defaultLocale: setup?.locale ?? draft.tenant.defaultLocale,
      jurisdictions: [quote.country],
      schools: draft.tenant.schools.map((school) => ({
        ...school,
        nameEn: setup ? setup.school.nameEn : input.schoolName,
        nameAr: setup ? setup.school.nameAr : school.nameAr,
        slug: setup?.school.slug ?? school.slug,
        countryCode: quote.country,
      })),
    },
    people: administrator
      ? {
          administrators: [
            setup.locale === "ar"
              ? {
                  givenNameEn: null,
                  familyNameEn: null,
                  givenNameAr: administrator.givenName,
                  familyNameAr: administrator.familyName,
                  email: administrator.email,
                }
              : {
                  givenNameEn: administrator.givenName,
                  familyNameEn: administrator.familyName,
                  givenNameAr: null,
                  familyNameAr: null,
                  email: administrator.email,
                },
          ],
          groupAdministrator: null,
        }
      : draft.people,
    plan: {
      planVersionId: spec.planVersionId,
      quantity: spec.quantity,
      unitPriceMinor: spec.unitPriceMinor,
      discountPercent: spec.discountPercent,
      addOns: spec.addOns.map((addOn) => ({
        addOnVersionId: addOn.addOnVersionId,
        quantity: addOn.quantity,
        unitPriceMinor: addOn.unitPriceMinor,
        schoolIndexes: [],
      })),
      terms: {
        state: "active",
        termStartsOn: spec.termStartsOn,
        termEndsOn: spec.termEndsOn,
        trialEndsOn: null,
        renewal: "auto",
        schedule: spec.schedule,
        contractedStudents: spec.planVersionId ? spec.quantity : null,
        censusOn: null,
        notice: null,
      },
    },
  };
}

/** How the quote's VAT is named, as the rate in force when it was made. */
export async function quoteVatName(quote: {
  country: string;
  createdAt: Date;
}): Promise<{ en: string; ar: string } | null> {
  const rate = rateOn(
    (await listTaxRates(requireBusiness())).map((row) => ({
      ...row,
      percent: Number(row.percent),
    })),
    quote.country,
    quote.createdAt.toISOString().slice(0, 10),
  );
  return rate ? { en: rate.nameEn, ar: rate.nameAr } : null;
}
