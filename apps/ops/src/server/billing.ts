import type { InvoiceLine } from "@faridalms/domain/invoices";

import { catalogue } from "@faridalms/database/business/catalogue";
import { customerById } from "@faridalms/database/business/customers";
import { draftInvoice } from "@faridalms/database/business/invoices";
import { listTaxRates } from "@faridalms/database/business/profile";
import {
  openSubscriptions,
  setTerms,
  subscriptionDetail,
} from "@faridalms/database/business/subscriptions";
import { rateOn } from "@faridalms/domain/business";
import {
  addMonths,
  DRAFT_AHEAD_DAYS,
  instalmentDays,
  monthsBetween,
  proratedShare,
  trueUpStudents,
} from "@faridalms/domain/invoices";
import { netMinor, splitMinor } from "@faridalms/domain/money";
import { addDays } from "@faridalms/domain/school";
import { INSTALMENT_COUNT } from "@faridalms/domain/subscriptions";

import type { Publishing } from "./publication";

/** What a subscription's year is billed for, one line per item it holds. */
interface Billed {
  itemId: string;
  nameEn: string;
  nameAr: string;
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
  /** Charged once, on the year's first invoice, rather than across it. */
  once: boolean;
  startsOn: string;
  endsOn: string | null;
}

const money = (minor: number) => (minor / 100).toFixed(2);

/**
 * Drafts what is due on the day for every contract: each instalment of its
 * term from a fortnight before it falls due, a prorated invoice for an
 * item that started during the term, and the census true-up when more
 * students were counted than contracted. Renews a term that ended, where
 * the contract renews on its own. Each is drafted once; finance issues it.
 */
export async function billingRound(
  deps: Pick<Publishing, "business" | "directory">,
  day: string,
  by: string,
): Promise<{ drafted: number; renewed: number }> {
  const db = deps.business;
  const [sold, rates, schools] = await Promise.all([
    catalogue(db),
    listTaxRates(db),
    deps.directory.schools(),
  ]);
  const unitOf = new Map<string, string>();
  for (const version of [...sold.plans, ...sold.addOns])
    for (const price of version.prices)
      unitOf.set(`${version.id}:${price.currency}`, price.unit);
  const vatRates = rates.map((rate) => ({
    ...rate,
    percent: Number(rate.percent),
  }));
  let drafted = 0;
  let renewed = 0;
  for (const subscription of await openSubscriptions(db)) {
    if (
      subscription.state !== "active" ||
      subscription.grandfathered ||
      !subscription.termStartsOn ||
      !subscription.termEndsOn
    )
      continue;
    let { termStartsOn, termEndsOn } = subscription;
    if (day >= termEndsOn && subscription.renewal === "auto") {
      const months = monthsBetween(termStartsOn, termEndsOn);
      termStartsOn = termEndsOn;
      termEndsOn = addMonths(termEndsOn, months);
      await setTerms(db, {
        id: subscription.id,
        terms: {
          state: "active",
          termStartsOn,
          termEndsOn,
          trialEndsOn: null,
          renewal: "auto",
          schedule: subscription.schedule,
          contractedStudents: subscription.contractedStudents,
          censusOn: subscription.censusOn
            ? addMonths(subscription.censusOn, months)
            : null,
          notice: subscription.notice,
        },
        by,
        reason: "Renewed on its own for another term",
      });
      renewed += 1;
    }
    if (day >= termEndsOn) continue;
    const [detail, found] = await Promise.all([
      subscriptionDetail(db, subscription.id),
      customerById(db, subscription.customerId),
    ]);
    if (!detail || !found) continue;
    const { customer, contacts } = found;
    const rate = rateOn(vatRates, customer.country, day);
    const language =
      contacts.find((contact) => contact.roles.includes("billing"))?.locale ??
      "en";
    const draft = (input: {
      kind: "instalment" | "proration" | "true_up";
      scheduleKey: string;
      forDay: string;
      lines: InvoiceLine[];
    }) =>
      draftInvoice(db, {
        customerId: customer.id,
        subscriptionId: subscription.id,
        currency: subscription.currency,
        country: customer.country,
        language,
        vatPercent: rate?.percent ?? 0,
        reverseCharge: rate?.reverseCharge ?? false,
        by,
        ...input,
      });
    const billed: Billed[] = detail.items.flatMap(({ item, plan, addOn }) => {
      const version = plan ?? addOn;
      if (!version) return [];
      return [
        {
          itemId: item.id,
          nameEn: version.nameEn,
          nameAr: version.nameAr,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          discountPercent: Number(item.discountPercent),
          once: unitOf.get(`${version.id}:${subscription.currency}`) === "once",
          startsOn: item.startsOn,
          endsOn: item.endsOn,
        },
      ];
    });
    const runsFromStart = billed.filter(
      (line) =>
        line.startsOn <= termStartsOn &&
        (line.endsOn === null || line.endsOn > termStartsOn),
    );

    const days = instalmentDays(termStartsOn, subscription.schedule);
    const count = INSTALMENT_COUNT[subscription.schedule];
    for (const [index, dueOn] of days.entries()) {
      if (day < addDays(dueOn, -DRAFT_AHEAD_DAYS) || runsFromStart.length === 0)
        continue;
      const lines = runsFromStart.flatMap((line): InvoiceLine[] => {
        const yearly = netMinor(line);
        if (line.once && index > 0) return [];
        const amount = line.once
          ? yearly
          : (splitMinor(yearly, count)[index] ?? 0);
        const terms = `${line.quantity} at ${money(line.unitPriceMinor)}${line.discountPercent ? `, ${line.discountPercent}% off` : ""}`;
        return [
          {
            descriptionEn:
              count > 1 && !line.once
                ? `${line.nameEn}: ${terms}, instalment ${index + 1} of ${count}`
                : `${line.nameEn}: ${terms}`,
            descriptionAr:
              count > 1 && !line.once
                ? `${line.nameAr}: ${line.quantity} × ${money(line.unitPriceMinor)}، القسط ${index + 1} من ${count}`
                : `${line.nameAr}: ${line.quantity} × ${money(line.unitPriceMinor)}`,
            itemCode: null,
            periodStart: termStartsOn,
            periodEnd: addDays(termEndsOn, -1),
            quantity: 1,
            unitPriceMinor: amount,
            discountPercent: 0,
          },
        ];
      });
      if (
        await draft({
          kind: "instalment",
          scheduleKey: `instalment:${subscription.id}:${termStartsOn}:${index + 1}`,
          forDay: dueOn,
          lines,
        })
      )
        drafted += 1;
    }

    for (const line of billed) {
      if (
        line.startsOn <= termStartsOn ||
        line.startsOn >= termEndsOn ||
        day < addDays(line.startsOn, -DRAFT_AHEAD_DAYS)
      )
        continue;
      const share = proratedShare({
        startsOn: line.startsOn,
        termStartsOn,
        termEndsOn,
      });
      const months = monthsBetween(line.startsOn, termEndsOn);
      const amount = line.once
        ? netMinor(line)
        : Math.round(netMinor(line) * share);
      if (
        await draft({
          kind: "proration",
          scheduleKey: `proration:${line.itemId}:${termStartsOn}`,
          forDay: line.startsOn,
          lines: [
            {
              descriptionEn: line.once
                ? `${line.nameEn}: ${line.quantity} at ${money(line.unitPriceMinor)}`
                : `${line.nameEn} from ${line.startsOn}: ${months} of ${monthsBetween(termStartsOn, termEndsOn)} months`,
              descriptionAr: line.once
                ? `${line.nameAr}: ${line.quantity} × ${money(line.unitPriceMinor)}`
                : `${line.nameAr} من ${line.startsOn}: ${months} من ${monthsBetween(termStartsOn, termEndsOn)} شهرًا`,
              itemCode: null,
              periodStart: line.startsOn,
              periodEnd: addDays(termEndsOn, -1),
              quantity: 1,
              unitPriceMinor: amount,
              discountPercent: 0,
            },
          ],
        })
      )
        drafted += 1;
    }

    const census = subscription.censusOn;
    const contracted = subscription.contractedStudents;
    const plan = runsFromStart.find(
      (line) =>
        detail.items.find(({ item }) => item.id === line.itemId)?.plan !== null,
    );
    if (census && contracted && plan && day >= census && census < termEndsOn) {
      const counted = schools
        .filter((school) => school.tenantId === subscription.tenantId)
        .reduce((sum, school) => sum + (school.usage?.students ?? 0), 0);
      const extra = trueUpStudents(contracted, counted);
      if (extra > 0) {
        const share = proratedShare({
          startsOn: census,
          termStartsOn,
          termEndsOn,
        });
        const amount = Math.round(
          netMinor({ ...plan, quantity: extra }) * share,
        );
        if (
          await draft({
            kind: "true_up",
            scheduleKey: `true_up:${subscription.id}:${termStartsOn}`,
            forDay: census,
            lines: [
              {
                descriptionEn: `${plan.nameEn}: ${extra} students past the ${contracted} contracted, counted on ${census}`,
                descriptionAr: `${plan.nameAr}: ${extra} طالبًا فوق ${contracted} المتعاقد عليهم، بحسب عدد ${census}`,
                itemCode: null,
                periodStart: census,
                periodEnd: addDays(termEndsOn, -1),
                quantity: 1,
                unitPriceMinor: amount,
                discountPercent: 0,
              },
            ],
          })
        )
          drafted += 1;
      }
    }
  }
  return { drafted, renewed };
}
