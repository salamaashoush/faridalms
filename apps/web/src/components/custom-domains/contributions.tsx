import type { ModuleFillings } from "~/utils/extension";

import { setupItemWords } from "~/components/home/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

/** What the school's own addresses add to the pages of core. */
export const CUSTOM_DOMAINS: ModuleFillings = {
  module: "custom_domains",
  fillings: [
    fill(setupItemWords, {
      item: "custom_domain",
      label: m.onboardingCustomDomain,
    }),
  ],
};
