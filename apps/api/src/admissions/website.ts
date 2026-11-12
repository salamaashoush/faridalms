import { publicIntakes } from "@faridalms/database/stores/admissions";
import {
  insertEnquiry,
  recentEnquiries,
} from "@faridalms/database/stores/enquiries";
import { pageTitlesOf } from "@faridalms/database/stores/site";
import { ORPCError } from "@orpc/server";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { formReceivers, siteIntakes } from "../website/points";
import { announceEnquiry } from "./enquiries";
import { enquiryPages } from "./points";

/** Five messages an hour from one network, sixty for a whole school. */
const ENQUIRIES_PER_NETWORK = 5;
const ENQUIRIES_PER_SCHOOL = 60;

/** What admissions shows on the school's website, and takes from its forms. */
export const ADMISSIONS_WEBSITE: ModuleContributions = {
  module: "admissions",
  needs: ["website"],
  contributions: [
    contribute(siteIntakes, {
      read: (scope, today) =>
        publicIntakes(scope.tx, { orgId: scope.schoolId, today }),
    }),
    contribute(formReceivers, {
      keep: async (unit, enquiry) => {
        const recent = await recentEnquiries(unit.tx, {
          orgId: unit.schoolId,
          networkKey: enquiry.networkKey,
        });
        if (
          recent.fromNetwork >= ENQUIRIES_PER_NETWORK ||
          recent.forSchool >= ENQUIRIES_PER_SCHOOL
        )
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: "site.too_many",
          });
        const id = Bun.randomUUIDv7();
        await insertEnquiry(unit.tx, {
          ...enquiry,
          tenantId: unit.tenantId,
          id,
          orgId: unit.schoolId,
        });
        return id;
      },
      announce: announceEnquiry,
    }),
    contribute(enquiryPages, {
      titlesOf: (context, pageId) =>
        pageTitlesOf(context.tx, { tenantId: context.tenantId, pageId }),
    }),
  ],
};
