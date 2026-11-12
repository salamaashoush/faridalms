import { Value } from "@faridalms/ui/system/value";

import { inLocale } from "~/hooks/useCurrentUser";

export interface IntakeFactProps {
  fact: { labelEn: string | null; labelAr: string | null } | undefined;
}

/** What a module keeps about an intake, as the school names it. */
export function IntakeFact({ fact }: IntakeFactProps) {
  return <Value>{fact ? inLocale(fact.labelEn, fact.labelAr) : null}</Value>;
}
