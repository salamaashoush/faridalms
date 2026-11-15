import { AGREEMENT_NAMES } from "@faridalms/domain/agreements";
import { Segmented } from "@faridalms/ui/system/panel";
import { NotFoundPage } from "@faridalms/ui/system/status-page";
import { useState } from "react";

import type { getAgreementText } from "../server/agreements";

import { AgreementText } from "./AgreementText";
import { CustomerFrame } from "./CustomerFrame";

export interface AgreementPageProps {
  text: Awaited<ReturnType<typeof getAgreementText>>;
}

const WORDS = {
  en: {
    version: (version: string, from: string) =>
      `Version ${version}, in effect from ${from}.`,
    digest: "Its fingerprint (SHA-256):",
  },
  ar: {
    version: (version: string, from: string) =>
      `الإصدار ${version}، ساري المفعول من ${from}.`,
    digest: "بصمته (SHA-256):",
  },
} as const;

/** A published agreement, as anyone reads it, in English or Arabic. */
export function AgreementPage({ text }: AgreementPageProps) {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  if (!text) return <NotFoundPage />;
  const shown = locale === "ar" && text.bodyAr ? "ar" : "en";
  const words = WORDS[shown];
  const from = new Date(`${text.effectiveOn}T00:00:00Z`).toLocaleDateString(
    shown === "ar" ? "ar-EG-u-nu-latn" : "en-GB",
    { dateStyle: "long", timeZone: "UTC" },
  );
  return (
    <CustomerFrame
      business={
        (shown === "ar" ? text.business?.nameAr : text.business?.nameEn) ?? ""
      }
      locale={shown}
    >
      <header className="grid gap-2">
        <h1 className="text-2xl leading-9 font-semibold">
          {AGREEMENT_NAMES[text.kind][shown]}
        </h1>
        <p className="text-sm leading-5 text-muted-foreground">
          {words.version(text.version, from)}
        </p>
        {text.bodyAr ? (
          <Segmented
            label="Language"
            value={locale}
            options={[
              { value: "en", label: "English" },
              { value: "ar", label: "العربية" },
            ]}
            onChange={setLocale}
          />
        ) : null}
      </header>
      <AgreementText
        body={shown === "ar" && text.bodyAr ? text.bodyAr : text.bodyEn}
        locale={shown}
      />
      <p className="text-xs leading-5 break-all text-muted-foreground">
        {words.digest} <span dir="ltr">{text.digest}</span>
      </p>
    </CustomerFrame>
  );
}
