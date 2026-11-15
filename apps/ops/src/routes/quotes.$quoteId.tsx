import { QuoteDocument } from "@faridalms/documents/QuoteDocument";
import { quoteReference } from "@faridalms/domain/quotes";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DocumentView } from "@faridalms/ui/system/document-view";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import { Segmented } from "@faridalms/ui/system/panel";
import {
  RecordColumns,
  RecordHeader,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarX,
  CheckCheck,
  FileCheck,
  Mail,
  Pencil,
  Printer,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attemptWith, failure } from "../actions";
import { QuoteForm } from "../components/QuoteForm";
import { formatWhen, QUOTE_STATE_NAMES, QUOTE_STATE_TONE } from "../format";
import { sendOffer } from "../server/offers";
import { accept, changeQuote, getQuote, sendQuote } from "../server/quotes";

export const Route = createFileRoute("/quotes/$quoteId")({
  validateSearch: v.object({
    language: v.optional(v.picklist(["en", "ar"]), "en"),
  }),
  staticData: { section: "/leads", title: "Quote" },
  loader: ({ params }) => getQuote({ data: { id: params.quoteId } }),
  component: QuotePage,
});

type Data = Awaited<ReturnType<typeof getQuote>>;

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

function QuotePage() {
  const data = Route.useLoaderData();
  const { language } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { quote, party } = data;
  const [editing, setEditing] = useState(false);
  const accepting = useSheet();
  const offering = useSheet();
  const markSent = useMarkSent(data);
  const open = quote.state === "draft" || quote.state === "sent";
  const acceptance = {
    label: "Record acceptance",
    icon: FileCheck,
    onClick: accepting.show,
  };
  const sendToCustomer = {
    label: quote.offer ? "Send again" : "Send to the customer",
    icon: Mail,
    onClick: offering.show,
  };
  const change = {
    label: quote.state === "draft" ? "Change it" : "Make a new version",
    icon: Pencil,
    onSelect: () => setEditing(true),
  };
  return (
    <Page width="record">
      <div className="print:hidden">
        <RecordHeader
          title={`Quote ${quoteReference(quote.number, quote.version)}`}
          status={{
            label: QUOTE_STATE_NAMES[quote.state],
            tone: QUOTE_STATE_TONE[quote.state],
          }}
          alerts={
            open && quote.validUntil < data.today
              ? [
                  {
                    label: "Past its validity",
                    tone: "warning",
                    icon: CalendarX,
                  },
                ]
              : []
          }
          facts={[
            ...(quote.offer && open
              ? [
                  {
                    label: "Sent to",
                    value: (
                      <span>
                        Sent to {quote.offer.to.name}{" "}
                        <span dir="ltr">({quote.offer.to.email})</span>
                      </span>
                    ),
                  },
                ]
              : []),
            ...(party
              ? [
                  {
                    label: "For",
                    value:
                      party.kind === "lead" ? (
                        <Link
                          to="/leads/$leadId"
                          params={{ leadId: party.id }}
                          className="hover:text-primary hover:underline"
                        >
                          {party.name}
                        </Link>
                      ) : (
                        <Link
                          to="/customers/$customerId"
                          params={{ customerId: party.id }}
                          className="hover:text-primary hover:underline"
                        >
                          {party.name}
                        </Link>
                      ),
                  },
                ]
              : []),
            ...(data.versions.length > 1
              ? [
                  {
                    label: "Versions",
                    value: (
                      <span>
                        Versions:{" "}
                        {data.versions.map((version, index) => (
                          <span key={version.id}>
                            {index ? ", " : ""}
                            {version.id === quote.id ? (
                              <span className="font-medium text-foreground">
                                {version.version}
                              </span>
                            ) : (
                              <Link
                                to="/quotes/$quoteId"
                                params={{ quoteId: version.id }}
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                {version.version}
                              </Link>
                            )}{" "}
                            ({QUOTE_STATE_NAMES[version.state]})
                          </span>
                        ))}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
          action={open ? sendToCustomer : undefined}
          menu={
            quote.state === "draft"
              ? [
                  change,
                  ...(data.business
                    ? [
                        {
                          label: "Mark as sent",
                          icon: CheckCheck,
                          onSelect: () => markSent.run(),
                        },
                      ]
                    : []),
                  { label: acceptance.label, onSelect: acceptance.onClick },
                ]
              : quote.state === "sent"
                ? [
                    change,
                    { label: acceptance.label, onSelect: acceptance.onClick },
                  ]
                : []
          }
        />
      </div>
      <RecordColumns
        main={
          <>
            {editing ? (
              <RecordSection
                title={
                  quote.state === "draft" ? "Change the quote" : "A new version"
                }
              >
                <Change data={data} onCancel={() => setEditing(false)} />
              </RecordSection>
            ) : null}
            <DocumentView
              label={`Quote ${quoteReference(quote.number, quote.version)}`}
              tools={
                <Segmented
                  label="Print in"
                  value={language}
                  options={[...LANGUAGES]}
                  onChange={(next) =>
                    void navigate({
                      search: (previous) => ({ ...previous, language: next }),
                      replace: true,
                      resetScroll: false,
                    })
                  }
                />
              }
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                >
                  <Printer aria-hidden />
                  Print or save as PDF
                </Button>
              }
            >
              <QuoteDocument
                quote={quote}
                party={
                  party ?? {
                    name: "",
                    nameAr: null,
                    address: null,
                    taxNumber: null,
                  }
                }
                business={data.business}
                vatName={data.vatName}
                language={language}
              />
            </DocumentView>
          </>
        }
        aside={
          quote.state === "accepted" ? (
            <div className="grid gap-6 print:hidden">
              <RecordSection
                title="Accepted"
                description={
                  quote.acceptedAt ? formatWhen(quote.acceptedAt) : undefined
                }
              >
                <div className="grid gap-3 text-sm leading-5">
                  {quote.attachmentName ? (
                    <a
                      href={`/quote-files/${quote.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {quote.attachmentName}
                    </a>
                  ) : (
                    <span>
                      Through its link by {quote.signerName}
                      {quote.signerTitle ? `, ${quote.signerTitle}` : ""} (
                      {quote.signerEmail})
                    </span>
                  )}
                  {quote.draftId ? (
                    <ButtonLink
                      to="/provisioning/$draftId"
                      params={{ draftId: quote.draftId }}
                      className="justify-self-start"
                    >
                      Set up its school
                    </ButtonLink>
                  ) : null}
                </div>
              </RecordSection>
            </div>
          ) : undefined
        }
      />
      {open ? (
        <SendOfferSheet
          key={`offer-${offering.key}`}
          data={data}
          open={offering.open}
          onOpenChange={offering.onOpenChange}
        />
      ) : null}
      {open ? (
        <AcceptSheet
          key={accepting.key}
          data={data}
          open={accepting.open}
          onOpenChange={accepting.onOpenChange}
        />
      ) : null}
    </Page>
  );
}

interface SendOfferSheetProps {
  data: Data;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Sends the quote to the customer with a link of their own to read it with
 * the terms and the data processing agreement, and accept them; for a party
 * with no school yet, naming the school their acceptance sets up.
 */
function SendOfferSheet({ data, open, onOpenChange }: SendOfferSheetProps) {
  const router = useRouter();
  const send = useServerFn(sendOffer);
  const start = data.offer;
  const [to, setTo] = useState(start.to);
  const [school, setSchool] = useState({
    nameEn: start.school.nameEn ?? "",
    nameAr: start.school.nameAr ?? "",
    slug: start.school.slug,
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugIssue, setSlugIssue] = useState<string | null>(null);
  const needed = (value: string, words: string) =>
    submitted && !value.trim() ? [words] : undefined;
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Send to the customer"
      submitLabel="Send"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (
          !to.name.trim() ||
          !to.email.trim() ||
          (start.needsSchool &&
            (!school.slug.trim() ||
              (!school.nameEn.trim() && !school.nameAr.trim())))
        )
          return;
        setPending(true);
        setError(null);
        setSlugIssue(null);
        const out = await attemptWith(
          () =>
            send({
              data: {
                quoteId: data.quote.id,
                to,
                school: start.needsSchool
                  ? {
                      nameEn: school.nameEn || null,
                      nameAr: school.nameAr || null,
                      slug: school.slug,
                    }
                  : null,
              },
            }),
          "It could not be sent.",
        );
        setPending(false);
        if (!out.ok) {
          if (out.field === "slug") setSlugIssue(out.message);
          else setError(out.message);
          return;
        }
        toast.success(`Sent to ${to.email}.`);
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        They get an email with a link to read the quote, the terms of service
        and the data processing agreement, and accept them. Accepting makes the
        customer and, with the school named here, creates it at once and emails
        its first administrator. The link stands until the quote's last day;
        sending again ends the link sent before.
      </p>
      {start.missing.length ? (
        <StatusText tone="warning">
          Set {start.missing.join(", and ")} first.
        </StatusText>
      ) : null}
      <div className="grid items-start gap-6 @md:grid-cols-2">
        <TextField
          label="Their name"
          value={to.name}
          onChange={(event) => setTo({ ...to, name: event.target.value })}
          errors={needed(to.name, "Give who it goes to.")}
        />
        <TextField
          label="Their email"
          type="email"
          dir="ltr"
          value={to.email}
          onChange={(event) => setTo({ ...to, email: event.target.value })}
          errors={needed(to.email, "Give their email address.")}
        />
        <SelectField
          label="Written in"
          value={to.locale}
          options={[...LANGUAGES]}
          onChange={(locale) => setTo({ ...to, locale })}
        />
      </div>
      {start.needsSchool ? (
        <div className="grid items-start gap-6 @md:grid-cols-2">
          <TextField
            label="School's name in English"
            value={school.nameEn}
            onChange={(event) =>
              setSchool({ ...school, nameEn: event.target.value })
            }
            errors={
              submitted && !school.nameEn.trim() && !school.nameAr.trim()
                ? ["Give the school a name in English or Arabic."]
                : undefined
            }
          />
          <TextField
            label="School's name in Arabic"
            dir="rtl"
            lang="ar"
            value={school.nameAr}
            onChange={(event) =>
              setSchool({ ...school, nameAr: event.target.value })
            }
          />
          <TextField
            label="Portal address"
            dir="ltr"
            hint={`${school.slug || "address"}.${start.portalDomain}`}
            value={school.slug}
            onChange={(event) => {
              setSlugIssue(null);
              setSchool({ ...school, slug: event.target.value });
            }}
            errors={
              slugIssue
                ? [slugIssue]
                : needed(school.slug, "Give the school's portal address.")
            }
          />
        </div>
      ) : null}
    </SheetForm>
  );
}

interface QuoteProps {
  data: Data;
}

interface MarkSent {
  run: () => Promise<void>;
  pending: boolean;
}

/** Marks a draft sent, after which a change makes a new version. */
function useMarkSent(data: Data): MarkSent {
  const router = useRouter();
  const send = useServerFn(sendQuote);
  const [pending, setPending] = useState(false);
  return {
    pending,
    run: async () => {
      setPending(true);
      const out = await attemptWith(
        () => send({ data: { id: data.quote.id } }),
        "It could not be marked as sent.",
      );
      setPending(false);
      if (!out.ok) {
        toast.error(out.message);
        return;
      }
      toast.success("Marked as sent. A change now makes a new version.");
      await router.invalidate();
    },
  };
}

interface ChangeProps extends QuoteProps {
  onCancel: () => void;
}

function Change({ data, onCancel }: ChangeProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const change = useServerFn(changeQuote);
  return (
    <QuoteForm
      initial={data.quote.spec}
      plans={data.selling.plans}
      addOns={data.selling.addOns}
      submitLabel={
        data.quote.state === "draft" ? "Save changes" : "Save as a new version"
      }
      secondary={
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      }
      onSubmit={async (spec) => {
        try {
          const out = await change({ data: { id: data.quote.id, spec } });
          if (!out.ok) return out.message;
          toast.success(
            out.id === data.quote.id ? "Quote saved." : "New version saved.",
          );
          if (out.id === data.quote.id) await router.invalidate();
          else
            await navigate({
              to: "/quotes/$quoteId",
              params: { quoteId: out.id },
            });
          return null;
        } catch (error) {
          return failure(error, "The quote could not be saved.");
        }
      }}
    />
  );
}

interface AcceptSheetProps extends QuoteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Records the quote accepted, with the signed copy or purchase order. */
function AcceptSheet({ data, open, onOpenChange }: AcceptSheetProps) {
  const navigate = useNavigate();
  const send = useServerFn(accept);
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Record acceptance"
      submitLabel="Record acceptance"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!file) return;
        setPending(true);
        setError(null);
        const form = new FormData();
        form.set("id", data.quote.id);
        form.set("attachment", file);
        const out = await attemptWith(
          () => send({ data: form }),
          "The acceptance could not be recorded.",
        );
        setPending(false);
        if (!out.ok) {
          setError(out.message);
          return;
        }
        toast.success("Accepted. Its school is ready to set up.");
        onOpenChange(false);
        await navigate({
          to: "/provisioning/$draftId",
          params: { draftId: out.value.draftId },
        });
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        Accepting makes its customer, if it has none, and begins its school's
        set-up with what the quote sells.
      </p>
      <FormField
        label="Signed copy or purchase order"
        hint="A PDF, PNG or JPEG."
        errors={submitted && !file ? ["Attach the signed copy."] : undefined}
      >
        {(control) => (
          <Input
            {...control}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
