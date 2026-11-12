import { intakeOpened } from "@faridalms/database/stores/admissions";
import { APPLICATION_CONSENTS } from "@faridalms/domain/admissions";
import { SELF_APPLICANT_ROLE } from "@faridalms/domain/workspace";

import type { ModuleContributions } from "../core/extension";

import { consentMoments } from "../consents/points";
import { addressConfirmations } from "../core/confirmed";
import { contribute } from "../core/extension";
import { portalDoors } from "../core/portal-face";
import { retentionSubjects } from "../core/retention";
import { setupMeasures } from "../core/setup";
import { fileHosts } from "../files/authorize";
import { mailboxHooks } from "../messages/conversations";
import { contextOpeners } from "../people/access";
import { admissionsCalendar } from "./calendar";
import { ADMISSIONS_HOSTS, ADMISSIONS_MAILBOXES } from "./hosts";
import { confirmApplicant } from "./registration";
import { ADMISSIONS_RETENTION } from "./retention";

/** What admissions tells the rest of the product: who applies, and where. */
export const ADMISSIONS: ModuleContributions = {
  module: "admissions",
  contributions: [
    admissionsCalendar,
    contribute(fileHosts, ADMISSIONS_HOSTS),
    contribute(portalDoors, { door: "apply" }),
    contribute(mailboxHooks, ADMISSIONS_MAILBOXES),
    contribute(consentMoments, { meanings: APPLICATION_CONSENTS }),
    contribute(retentionSubjects, ADMISSIONS_RETENTION),
    contribute(setupMeasures, {
      item: "admissions_ready",
      seen: (scope) =>
        intakeOpened(scope.tx, {
          tenantId: scope.tenantId,
          orgId: scope.schoolId,
        }),
    }),
    contribute(addressConfirmations, { confirmed: confirmApplicant }),
    // Someone applying for themself works in their own context until they
    // are enrolled, when the student role opens it.
    contribute(contextOpeners, {
      context: "student",
      opens: async (_scope, input) => input.roles.includes(SELF_APPLICANT_ROLE),
    }),
  ],
};
