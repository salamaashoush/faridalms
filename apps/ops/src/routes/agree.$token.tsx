import { AGREEMENT_NAMES } from "@faridalms/domain/agreements";
import { CheckboxGroupField, TextField } from "@faridalms/ui/system/form-field";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { StatusPage } from "@faridalms/ui/system/status-page";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CircleCheck, Link2Off } from "lucide-react";
import { useState } from "react";

import { attempt } from "../actions";
import { CustomerFrame } from "../components/CustomerFrame";
import {
  acceptAgreementsByLink,
  getAgreementRequest,
} from "../server/agreements";

export const Route = createFileRoute("/agree/$token")({
  loader: ({ params }) =>
    getAgreementRequest({ data: { token: params.token } }),
  head: () => ({ meta: [{ title: "Agreements" }] }),
  component: AgreePage,
});

type Request = NonNullable<Awaited<ReturnType<typeof getAgreementRequest>>>;

const WORDS = {
  en: {
    title: "Accept our agreements",
    lead: (customer: string) =>
      `Read each agreement below, then accept them on behalf of ${customer}.`,
    read: "Read it",
    version: (version: string) => `version ${version}`,
    name: "Your name",
    position: "Your title",
    email: "Your email",
    consent: (customer: string) =>
      `I have read them and accept them on behalf of ${customer}, which I am authorised to do.`,
    consentLabel: "Acceptance",
    accept: "Accept",
    needed: "Fill this in.",
    tick: "Tick the box to accept.",
    failed: "It could not be recorded. Try again.",
    done: "Thank you",
    doneLead: "Your acceptance is recorded. We have emailed you a copy.",
    gone: "This link no longer stands",
    goneLead:
      "It may have been used already, or be more than 30 days old. Ask us for a new one.",
    nothing: "Nothing to accept",
    nothingLead: "The agreements in force are accepted already. Thank you.",
  },
  ar: {
    title: "قبول اتفاقياتنا",
    lead: (customer: string) =>
      `اقرأوا كل اتفاقية أدناه، ثم اقبلوها نيابةً عن ${customer}.`,
    read: "اقرأها",
    version: (version: string) => `الإصدار ${version}`,
    name: "اسمك",
    position: "مسمّاك الوظيفي",
    email: "بريدك الإلكتروني",
    consent: (customer: string) =>
      `قرأتها وأقبلها نيابةً عن ${customer}، ولي الصلاحية لذلك.`,
    consentLabel: "القبول",
    accept: "قبول",
    needed: "املأ هذا الحقل.",
    tick: "ضع علامة في المربع للقبول.",
    failed: "تعذّر تسجيل القبول. حاول مرة أخرى.",
    done: "شكرًا لكم",
    doneLead: "سُجّل قبولكم، وأرسلنا إليكم نسخة بالبريد الإلكتروني.",
    gone: "لم يعد هذا الرابط صالحًا",
    goneLead:
      "ربما استُخدم من قبل، أو مضى عليه أكثر من 30 يومًا. اطلبوا منا رابطًا جديدًا.",
    nothing: "لا شيء للقبول",
    nothingLead: "الاتفاقيات السارية مقبولة بالفعل. شكرًا لكم.",
  },
} as const;

/** What a customer's contact opens from their link: the agreements in force to accept. */
function AgreePage() {
  const request = Route.useLoaderData();
  if (!request)
    return (
      <StatusPage
        icon={<Link2Off className="size-5" />}
        title={WORDS.en.gone}
        description={WORDS.en.goneLead}
      />
    );
  return <Agree request={request} />;
}

interface AgreeProps {
  request: Request;
}

function Agree({ request }: AgreeProps) {
  const { token } = Route.useParams();
  const accept = useServerFn(acceptAgreementsByLink);
  const locale = request.locale;
  const words = WORDS[locale];
  const customer =
    locale === "ar"
      ? (request.customer.nameAr ?? request.customer.nameEn)
      : request.customer.nameEn;
  const business =
    locale === "ar" ? request.business.nameAr : request.business.nameEn;
  const [name, setName] = useState(request.contact.name);
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState(request.contact.email ?? "");
  const [ticked, setTicked] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done || request.due.length === 0)
    return (
      <CustomerFrame business={business} locale={locale}>
        <StatusPage
          icon={<CircleCheck className="size-5" />}
          title={done ? words.done : words.nothing}
          description={done ? words.doneLead : words.nothingLead}
        />
      </CustomerFrame>
    );
  const missing = (value: string) =>
    submitted && !value.trim() ? [words.needed] : undefined;
  return (
    <CustomerFrame business={business} locale={locale}>
      <header className="grid gap-2">
        <h1 className="text-2xl leading-9 font-semibold">{words.title}</h1>
        <p className="text-sm leading-5 text-muted-foreground">
          {words.lead(customer)}
        </p>
      </header>
      <ul className="grid gap-2" aria-label={words.title}>
        {request.due.map((agreement) => (
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
      <form
        aria-label={words.title}
        noValidate
        className="grid gap-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!name.trim() || !email.trim() || ticked.length === 0) return;
          setPending(true);
          setError(null);
          const failed = await attempt(
            () =>
              accept({
                data: {
                  token,
                  acceptance: {
                    signer: { name, title: title || null, email },
                    accepted: true,
                  },
                },
              }),
            words.failed,
          );
          setPending(false);
          if (failed) {
            setError(failed);
            return;
          }
          setDone(true);
        }}
      >
        <div className="grid items-start gap-6 @md:grid-cols-2">
          <TextField
            label={words.name}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            errors={missing(name)}
          />
          <TextField
            label={words.position}
            autoComplete="organization-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextField
            label={words.email}
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            errors={missing(email)}
          />
        </div>
        <CheckboxGroupField
          label={words.consentLabel}
          value={ticked}
          options={[{ value: "accepted", label: words.consent(customer) }]}
          onChange={setTicked}
          errors={submitted && ticked.length === 0 ? [words.tick] : undefined}
        />
        <FormFooter
          submitLabel={words.accept}
          pending={pending}
          error={error}
        />
      </form>
    </CustomerFrame>
  );
}
