import { QuoteDocument } from "@faridalms/documents/QuoteDocument";
import { AGREEMENT_NAMES } from "@faridalms/domain/agreements";
import { Button } from "@faridalms/ui/button";
import {
  CheckboxGroupField,
  FormField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { SettingsGroup } from "@faridalms/ui/system/settings-section";
import { StatusPage } from "@faridalms/ui/system/status-page";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarX, CircleCheck, Link2Off, Printer } from "lucide-react";
import { useState } from "react";

import { attemptWith } from "../actions";
import { CustomerFrame } from "../components/CustomerFrame";
import { acceptOffer, getOffer } from "../server/offers";

export const Route = createFileRoute("/offer/$token")({
  loader: ({ params }) => getOffer({ data: { token: params.token } }),
  head: () => ({ meta: [{ title: "Quote" }] }),
  component: OfferPage,
});

type Offer = NonNullable<Awaited<ReturnType<typeof getOffer>>>;

const WORDS = {
  en: {
    title: (reference: string) => `Quote ${reference}`,
    lead: "Read the quote and the agreements, then accept them below.",
    print: "Print or save as PDF",
    school: "Your school",
    portal: "Its address",
    organisation: "Your organisation, as invoices name it",
    legalNameEn: "Legal name in English",
    legalNameAr: "Legal name in Arabic",
    taxNumber: "Tax registration number",
    registry: "Commercial registry",
    address: "Billing address",
    signer: "Who accepts",
    name: "Your name",
    position: "Your title",
    email: "Your email",
    administrator: "The school's first administrator",
    administratorLead:
      "They receive an email with a link to sign in and set the school up.",
    givenName: "First name",
    adminEmail: "Their email",
    familyName: "Last name",
    agreements: "The agreements",
    read: "Read it",
    version: (version: string) => `version ${version}`,
    consentLabel: "Acceptance",
    consent: (reference: string, customer: string) =>
      `I accept quote ${reference}, the terms of service and the data processing agreement on behalf of ${customer}, which I am authorised to do.`,
    accept: "Accept",
    needed: "Fill this in.",
    tick: "Tick the box to accept.",
    failed: "It could not be accepted. Try again.",
    created: "Your school is ready",
    createdLead: (email: string) =>
      `Thank you. ${email} has an email with a link to sign in. We have emailed you a copy of your acceptance.`,
    accepted: "Thank you",
    acceptedLead:
      "Your acceptance is recorded. We will be in touch to finish setting up your school.",
    already: "Accepted",
    alreadyLead: "This quote has been accepted. Thank you.",
    replaced: "A newer version replaced this quote",
    replacedLead: "Ask us for the link to the newer version.",
    expired: "This quote is past its validity",
    expiredLead: "Ask us for a new one.",
    gone: "This link no longer stands",
    goneLead: "A newer link may have been sent. Ask us for it.",
  },
  ar: {
    title: (reference: string) => `عرض السعر ${reference}`,
    lead: "اقرأوا عرض السعر والاتفاقيات، ثم اقبلوها أدناه.",
    print: "طباعة أو حفظ بصيغة PDF",
    school: "مدرستكم",
    portal: "عنوانها",
    organisation: "مؤسستكم كما تُذكر في الفواتير",
    legalNameEn: "الاسم القانوني بالإنجليزية",
    legalNameAr: "الاسم القانوني بالعربية",
    taxNumber: "رقم التسجيل الضريبي",
    registry: "السجل التجاري",
    address: "عنوان الفواتير",
    signer: "من يقبل",
    name: "اسمك",
    position: "مسمّاك الوظيفي",
    email: "بريدك الإلكتروني",
    administrator: "المسؤول الأول عن المدرسة",
    administratorLead: "تصله رسالة فيها رابط لتسجيل الدخول وإعداد المدرسة.",
    givenName: "الاسم الأول",
    adminEmail: "بريده الإلكتروني",
    familyName: "اسم العائلة",
    agreements: "الاتفاقيات",
    read: "اقرأها",
    version: (version: string) => `الإصدار ${version}`,
    consentLabel: "القبول",
    consent: (reference: string, customer: string) =>
      `أقبل عرض السعر ${reference} وشروط الخدمة واتفاقية معالجة البيانات نيابةً عن ${customer}، ولي الصلاحية لذلك.`,
    accept: "قبول",
    needed: "املأ هذا الحقل.",
    tick: "ضع علامة في المربع للقبول.",
    failed: "تعذّر القبول. حاول مرة أخرى.",
    created: "مدرستكم جاهزة",
    createdLead: (email: string) =>
      `شكرًا لكم. وصلت إلى ${email} رسالة فيها رابط لتسجيل الدخول، وأرسلنا إليكم نسخة من قبولكم.`,
    accepted: "شكرًا لكم",
    acceptedLead: "سُجّل قبولكم، وسنتواصل معكم لإكمال إعداد مدرستكم.",
    already: "مقبول",
    alreadyLead: "قُبل عرض السعر هذا. شكرًا لكم.",
    replaced: "حلّ محل عرض السعر هذا إصدار أحدث",
    replacedLead: "اطلبوا منا رابط الإصدار الأحدث.",
    expired: "انتهت صلاحية عرض السعر هذا",
    expiredLead: "اطلبوا منا عرضًا جديدًا.",
    gone: "لم يعد هذا الرابط صالحًا",
    goneLead: "ربما أُرسل رابط أحدث. اطلبوا منا.",
  },
} as const;

/** What the customer opens from the quote's email: the quote, and accepting it. */
function OfferPage() {
  const offer = Route.useLoaderData();
  if (!offer)
    return (
      <StatusPage
        icon={<Link2Off className="size-5" />}
        title={WORDS.en.gone}
        description={WORDS.en.goneLead}
      />
    );
  return <OfferView offer={offer} />;
}

interface OfferViewProps {
  offer: Offer;
}

function OfferView({ offer }: OfferViewProps) {
  const locale = offer.locale;
  const words = WORDS[locale];
  const business =
    locale === "ar" ? offer.business.legalNameAr : offer.business.legalNameEn;
  const [outcome, setOutcome] = useState<{
    created: boolean;
    email: string | null;
  } | null>(null);
  const closed =
    offer.state === "accepted"
      ? { title: words.already, lead: words.alreadyLead, icon: CircleCheck }
      : offer.state === "replaced"
        ? { title: words.replaced, lead: words.replacedLead, icon: Link2Off }
        : offer.state === "expired"
          ? { title: words.expired, lead: words.expiredLead, icon: CalendarX }
          : null;
  if (outcome) {
    const { created, email } = outcome;
    return (
      <CustomerFrame business={business} locale={locale}>
        <StatusPage
          icon={<CircleCheck className="size-5" />}
          title={created ? words.created : words.accepted}
          description={
            created && email ? words.createdLead(email) : words.acceptedLead
          }
        />
      </CustomerFrame>
    );
  }
  return (
    <CustomerFrame business={business} locale={locale}>
      <header className="grid gap-2 print:hidden">
        <h1 className="text-2xl leading-9 font-semibold">
          {words.title(offer.reference)}
        </h1>
        <p className="text-sm leading-5 text-muted-foreground">
          {closed ? closed.lead : words.lead}
        </p>
      </header>
      <section aria-label={words.title(offer.reference)} className="grid gap-3">
        <div className="flex justify-end print:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer aria-hidden />
            {words.print}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-white text-black">
          <QuoteDocument
            quote={offer.quote}
            party={offer.party}
            business={offer.business}
            vatName={offer.vatName}
            language={locale}
          />
        </div>
      </section>
      {closed ? (
        <StatusPage
          icon={<closed.icon className="size-5" />}
          title={closed.title}
          description={closed.lead}
        />
      ) : (
        <AcceptForm offer={offer} onAccepted={setOutcome} />
      )}
    </CustomerFrame>
  );
}

interface AcceptFormProps {
  offer: Offer;
  onAccepted: (outcome: { created: boolean; email: string | null }) => void;
}

function AcceptForm({ offer, onAccepted }: AcceptFormProps) {
  const { token } = Route.useParams();
  const accept = useServerFn(acceptOffer);
  const locale = offer.locale;
  const words = WORDS[locale];
  const [fields, setFields] = useState({
    legalNameEn: offer.prefill.legalNameEn,
    legalNameAr: offer.prefill.legalNameAr,
    taxNumber: offer.prefill.taxNumber,
    commercialRegistry: "",
    address: offer.prefill.address,
    signerName: offer.prefill.signer.name,
    signerTitle: "",
    signerEmail: offer.prefill.signer.email,
    givenName: "",
    familyName: "",
    adminEmail: offer.prefill.signer.email,
  });
  const [ticked, setTicked] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const school = offer.school;
  const required: (keyof typeof fields)[] = [
    "legalNameEn",
    "signerName",
    "signerEmail",
    ...(school
      ? (["givenName", "familyName", "adminEmail"] as const)
      : ([] as const)),
  ];
  const missing = (key: keyof typeof fields) =>
    submitted && required.includes(key) && !fields[key].trim()
      ? [words.needed]
      : undefined;
  const customer =
    (locale === "ar" && fields.legalNameAr.trim()) ||
    fields.legalNameEn.trim() ||
    "…";
  return (
    <form
      aria-label={words.consentLabel}
      noValidate
      className="grid gap-8 print:hidden"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitted(true);
        if (required.some((key) => !fields[key].trim()) || !ticked.length)
          return;
        setPending(true);
        setError(null);
        const out = await attemptWith(
          () =>
            accept({
              data: {
                token,
                acceptance: {
                  legalNameEn: fields.legalNameEn,
                  legalNameAr: fields.legalNameAr || null,
                  taxNumber: fields.taxNumber || null,
                  commercialRegistry: fields.commercialRegistry || null,
                  address: fields.address || null,
                  signer: {
                    name: fields.signerName,
                    title: fields.signerTitle || null,
                    email: fields.signerEmail,
                  },
                  administrator: school
                    ? {
                        givenName: fields.givenName,
                        familyName: fields.familyName,
                        email: fields.adminEmail,
                      }
                    : null,
                  accepted: true,
                },
              },
            }),
          words.failed,
        );
        setPending(false);
        if (!out.ok) {
          setError(out.message);
          return;
        }
        onAccepted({
          created: out.value.created,
          email: school ? fields.adminEmail : null,
        });
      }}
    >
      {school ? (
        <SettingsGroup title={words.school}>
          <dl className="grid gap-3 text-sm leading-5 @md:grid-cols-2">
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground">{words.school}</dt>
              <dd className="font-medium">
                {(locale === "ar" ? school.nameAr : school.nameEn) ??
                  school.nameEn ??
                  school.nameAr}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground">{words.portal}</dt>
              <dd className="font-medium" dir="ltr">
                {school.slug}.{offer.portalDomain}
              </dd>
            </div>
          </dl>
        </SettingsGroup>
      ) : null}
      {offer.onRecord ? null : (
        <SettingsGroup title={words.organisation}>
          <div className="grid items-start gap-6 @md:grid-cols-2">
            <TextField
              label={words.legalNameEn}
              dir="ltr"
              autoComplete="organization"
              value={fields.legalNameEn}
              onChange={(event) => set("legalNameEn", event.target.value)}
              errors={missing("legalNameEn")}
            />
            <TextField
              label={words.legalNameAr}
              dir="rtl"
              lang="ar"
              value={fields.legalNameAr}
              onChange={(event) => set("legalNameAr", event.target.value)}
            />
            <TextField
              label={words.taxNumber}
              dir="ltr"
              value={fields.taxNumber}
              onChange={(event) => set("taxNumber", event.target.value)}
            />
            <TextField
              label={words.registry}
              dir="ltr"
              value={fields.commercialRegistry}
              onChange={(event) =>
                set("commercialRegistry", event.target.value)
              }
            />
          </div>
          <FormField label={words.address}>
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={fields.address}
                onChange={(event) => set("address", event.target.value)}
              />
            )}
          </FormField>
        </SettingsGroup>
      )}
      <SettingsGroup title={words.signer}>
        <div className="grid items-start gap-6 @md:grid-cols-2">
          <TextField
            label={words.name}
            autoComplete="name"
            value={fields.signerName}
            onChange={(event) => set("signerName", event.target.value)}
            errors={missing("signerName")}
          />
          <TextField
            label={words.position}
            autoComplete="organization-title"
            value={fields.signerTitle}
            onChange={(event) => set("signerTitle", event.target.value)}
          />
          <TextField
            label={words.email}
            type="email"
            dir="ltr"
            autoComplete="email"
            value={fields.signerEmail}
            onChange={(event) => set("signerEmail", event.target.value)}
            errors={missing("signerEmail")}
          />
        </div>
      </SettingsGroup>
      {school ? (
        <SettingsGroup title={words.administrator}>
          <p className="text-sm leading-5 text-muted-foreground">
            {words.administratorLead}
          </p>
          <div className="grid items-start gap-6 @md:grid-cols-2">
            <TextField
              label={words.givenName}
              autoComplete="off"
              value={fields.givenName}
              onChange={(event) => set("givenName", event.target.value)}
              errors={missing("givenName")}
            />
            <TextField
              label={words.familyName}
              autoComplete="off"
              value={fields.familyName}
              onChange={(event) => set("familyName", event.target.value)}
              errors={missing("familyName")}
            />
            <TextField
              label={words.adminEmail}
              type="email"
              dir="ltr"
              autoComplete="off"
              value={fields.adminEmail}
              onChange={(event) => set("adminEmail", event.target.value)}
              errors={missing("adminEmail")}
            />
          </div>
        </SettingsGroup>
      ) : null}
      <SettingsGroup title={words.agreements}>
        <ul className="grid gap-2">
          {offer.agreements.map((agreement) => (
            <li
              key={agreement.kind}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-4"
            >
              <span className="font-medium">
                {AGREEMENT_NAMES[agreement.kind][locale]},{" "}
                <span dir="ltr">{words.version(agreement.version)}</span>
              </span>
              <a
                href={agreement.path}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {words.read}
              </a>
            </li>
          ))}
        </ul>
      </SettingsGroup>
      <CheckboxGroupField
        label={words.consentLabel}
        value={ticked}
        options={[
          {
            value: "accepted",
            label: words.consent(offer.reference, customer),
          },
        ]}
        onChange={setTicked}
        errors={submitted && ticked.length === 0 ? [words.tick] : undefined}
      />
      <FormFooter submitLabel={words.accept} pending={pending} error={error} />
    </form>
  );
}
