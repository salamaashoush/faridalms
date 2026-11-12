import {
  Fact,
  Facts,
  phoneLink,
  RecordSection,
} from "@faridalms/ui/system/record-page";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import type { ApplicationContactProps } from "./slots";

export interface ContactFactsProps {
  email: string | null;
  phone: string | null;
}

/** An email and a phone number, each opening the reader's mail or phone. */
export function ContactFacts({ email, phone }: ContactFactsProps) {
  return (
    <>
      <Fact label={m.admFieldEmail()} wide>
        {email ? (
          <a
            href={`mailto:${email}`}
            dir="ltr"
            className={`text-primary hover:underline ${phoneLink}`}
          >
            {email}
          </a>
        ) : null}
      </Fact>
      <Fact label={m.admFieldPhone()} wide>
        {phone ? (
          <a
            href={`tel:${phone.replaceAll(/[^\d+]/g, "")}`}
            dir="ltr"
            className={`text-primary hover:underline ${phoneLink}`}
          >
            {phone}
          </a>
        ) : null}
      </Fact>
    </>
  );
}

/** Who sent the application and how to reach them. */
export function ContactSection({ row }: ApplicationContactProps) {
  return (
    <RecordSection
      title={m.aplSectionContact()}
      description={m.aplSectionContactHint()}
    >
      <Facts>
        <Fact label={m.aplFieldApplicant()}>
          <bdi>{inLocale(row.family.nameEn, row.family.nameAr)}</bdi>
        </Fact>
        <ContactFacts email={row.family.email} phone={row.family.phone} />
      </Facts>
    </RecordSection>
  );
}
