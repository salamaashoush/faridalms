import type { ModuleFillings } from "~/utils/extension";

import { siteAudiences } from "~/components/site/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

/** The website's studio speaks of parents and families, and offers a voice from a parent. */
export const FAMILIES_ON_WEBSITE: ModuleFillings = {
  module: "families",
  needs: ["website"],
  fillings: [
    fill(siteAudiences, "parent"),
    replaceWords(m.siteTypeHintQuoteCore, m.siteTypeHintQuote),
    replaceWords(m.siteTypeHintVoicesCore, m.siteTypeHintVoices),
    replaceWords(m.siteTypeHintQuickLinksCore, m.siteTypeHintQuickLinks),
    replaceWords(m.siteTypeHintFormCore, m.siteTypeHintForm),
    replaceWords(m.siteFieldClosedHintCore, m.siteFieldClosedHint),
    replaceWords(m.siteTemplateParentsCore, m.siteTemplateParents),
    replaceWords(
      m.siteTemplateParentsEarlyYearsCore,
      m.siteTemplateParentsEarlyYears,
    ),
    replaceWords(
      m.siteTemplateHintHomeCommunityCore,
      m.siteTemplateHintHomeCommunity,
    ),
    replaceWords(
      m.siteTemplateHintAdmissionsEarlyYearsCore,
      m.siteTemplateHintAdmissionsEarlyYears,
    ),
    replaceWords(m.siteTemplateHintParentsCore, m.siteTemplateHintParents),
  ],
};
