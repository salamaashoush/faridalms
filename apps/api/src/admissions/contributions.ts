import { SELF_APPLICANT_ROLE } from "@faridalms/domain/workspace";

import type { ModuleContributions } from "../core/extension";

import { addressConfirmations } from "../core/confirmed";
import { contribute } from "../core/extension";
import { contextOpeners } from "../people/access";
import { confirmApplicant } from "./registration";

/** What admissions tells the rest of the product: who applies, and where. */
export const ADMISSIONS: ModuleContributions = {
  module: "admissions",
  contributions: [
    contribute(addressConfirmations, { confirmed: confirmApplicant }),
    // Someone applying for themself works in their own context until they
    // are enrolled, when the student role opens it.
    contribute(contextOpeners, {
      context: "student",
      opens: async (_scope, input) => input.roles.includes(SELF_APPLICANT_ROLE),
    }),
  ],
};
