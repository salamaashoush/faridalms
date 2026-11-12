import type { CellTransaction } from "@faridalms/database/context";
import type { DirectorySchool } from "@faridalms/database/directory/client";
import type { Currency, Fee } from "@faridalms/domain/admissions";
import type { EnquiryPurpose } from "@faridalms/domain/enquiries";
import type { FormAnswer } from "@faridalms/domain/questions";
import type { SiteLocale } from "@faridalms/domain/site-sections";

import type { RequestContext } from "../core/context";
import type { PublicUnit } from "../core/site";

import { point } from "../core/extension";

/** An intake as the website's admissions sections show it: names, dates and fees. */
export interface SiteIntake {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
  startsOn: string;
  opensOn: string;
  closesOn: string;
  decisionsOn: string | null;
  currency: Currency;
  fees: Fee[];
}

/** Where the intakes a school's site shows come from; a visitor's page reads them as the site role. */
export interface SiteIntakes {
  read(
    scope: { tx: CellTransaction; schoolId: string },
    today: string,
  ): Promise<SiteIntake[]>;
}

export const siteIntakes = point<SiteIntakes>("site intakes");

/**
 * A word a module lends the school's website, by the name the website's
 * pages know it by: the year an intake's tuition runs for, say. A visitor
 * learns only which words the pages may use, never the school's modules.
 */
export interface SiteWord {
  word: string;
}

export const siteWords = point<SiteWord>("site words");

/** Every intake the given sources hold, open from today. */
export async function intakesFrom(
  sources: readonly SiteIntakes[],
  scope: { tx: CellTransaction; schoolId: string },
  today: string,
): Promise<SiteIntake[]> {
  return (
    await Promise.all(sources.map((source) => source.read(scope, today)))
  ).flat();
}

/** What a visitor sent from a form section, as the form asked it. */
export interface WebsiteEnquiry {
  pageId: string;
  sectionId: string;
  locale: SiteLocale;
  purpose: EnquiryPurpose;
  name: string;
  email: string;
  phone: string;
  childName: string;
  childYear: string;
  message: string;
  answers: FormAnswer[];
  /** The visitor's network, keyed so it names no address; empty when unknown. */
  networkKey: string;
}

/**
 * Who takes what a site's forms send. Without one a form has nowhere to
 * send to and is refused.
 */
export interface FormReceiver {
  /** Keeps the enquiry as the site role, refusing a flood; returns its id. */
  keep(unit: PublicUnit, enquiry: WebsiteEnquiry): Promise<string>;
  /** Tells those who answer enquiries, once it is kept. */
  announce(
    context: RequestContext,
    school: DirectorySchool,
    enquiry: {
      id: string;
      name: string;
      purpose: EnquiryPurpose;
      message: string;
    },
  ): Promise<void>;
}

export const formReceivers = point<FormReceiver>("form receivers");
