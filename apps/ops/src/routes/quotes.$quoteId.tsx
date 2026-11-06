import { QuoteDocument } from "@faridalms/documents/QuoteDocument";
import { quoteReference } from "@faridalms/domain/quotes";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { FormField } from "@faridalms/ui/system/form-field";
import {
  RecordColumns,
  RecordHeader,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarX, Pencil, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attemptWith, failure } from "../actions";
import { QuoteForm } from "../components/QuoteForm";
import { formatWhen, QUOTE_STATE_NAMES, QUOTE_STATE_TONE } from "../format";
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
  const { quote, party } = data;
  const [editing, setEditing] = useState(false);
  const open = quote.state === "draft" || quote.state === "sent";
  return (
    <>
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
          tools={
            open ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing((on) => !on)}
              >
                <Pencil aria-hidden />
                {quote.state === "draft" ? "Change it" : "Make a new version"}
              </Button>
            ) : undefined
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
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <nav
                  aria-label="Print in"
                  className="flex gap-1 rounded-lg bg-muted p-1"
                >
                  {LANGUAGES.map((choice) => (
                    <Link
                      key={choice.value}
                      to="/quotes/$quoteId"
                      params={{ quoteId: quote.id }}
                      search={{ language: choice.value }}
                      aria-current={
                        choice.value === language ? "true" : undefined
                      }
                      className="inline-flex min-h-8 items-center rounded-md px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
                    >
                      {choice.label}
                    </Link>
                  ))}
                </nav>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                >
                  <Printer aria-hidden />
                  Print or save as PDF
                </Button>
              </div>
              <div className="rounded-lg border bg-card p-2 shadow-sm print:border-0 print:p-0 print:shadow-none">
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
              </div>
            </div>
          </>
        }
        aside={
          <div className="grid gap-6 print:hidden">
            {quote.state === "draft" ? (
              <RecordSection
                title="Send it"
                description="Once sent, a change makes a new version and this one stays as it was."
              >
                <SendButton data={data} />
              </RecordSection>
            ) : null}
            {quote.state === "accepted" ? (
              <RecordSection
                title="Accepted"
                description={
                  quote.acceptedAt ? formatWhen(quote.acceptedAt) : undefined
                }
              >
                <div className="grid gap-3 text-sm leading-5">
                  <a
                    href={`/quote-files/${quote.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {quote.attachmentName}
                  </a>
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
            ) : null}
            {open ? <Accept data={data} /> : null}
          </div>
        }
      />
    </>
  );
}

interface QuoteProps {
  data: Data;
}

function SendButton({ data }: QuoteProps) {
  const router = useRouter();
  const send = useServerFn(sendQuote);
  const [sending, setSending] = useState(false);
  return (
    <Button
      type="button"
      disabled={sending || !data.business}
      onClick={async () => {
        setSending(true);
        try {
          const out = await send({ data: { id: data.quote.id } });
          if (out.ok) {
            toast.success("Marked as sent. A change now makes a new version.");
            await router.invalidate();
          } else toast.error(out.message);
        } catch (error) {
          const said = failure(error, "It could not be marked as sent.");
          if (said) toast.error(said);
        } finally {
          setSending(false);
        }
      }}
    >
      {sending ? "Marking…" : "Mark as sent"}
    </Button>
  );
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

/** Records the quote accepted, with the signed copy or purchase order. */
function Accept({ data }: QuoteProps) {
  const navigate = useNavigate();
  const send = useServerFn(accept);
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsSection
      title="Record acceptance"
      description="Accepting makes its customer, if it has none, and begins its school's set-up with what the quote sells."
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
        await navigate({
          to: "/provisioning/$draftId",
          params: { draftId: out.value.draftId },
        });
      }}
    >
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
    </SettingsSection>
  );
}
