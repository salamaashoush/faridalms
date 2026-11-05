import { QuoteDocument } from "@faridalms/documents/QuoteDocument";
import { quoteReference } from "@faridalms/domain/quotes";
import { Badge } from "@faridalms/ui/badge";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { failure } from "../actions";
import { QuoteForm } from "../components/QuoteForm";
import { formatWhen, QUOTE_STATE_NAMES } from "../format";
import { accept, changeQuote, getQuote, sendQuote } from "../server/quotes";

export const Route = createFileRoute("/quotes/$quoteId")({
  validateSearch: v.object({
    language: v.optional(v.picklist(["en", "ar"]), "en"),
  }),
  loader: ({ params }) => getQuote({ data: { id: params.quoteId } }),
  component: QuotePage,
});

type Data = Awaited<ReturnType<typeof getQuote>>;

function QuotePage() {
  const data = Route.useLoaderData();
  const { language } = Route.useSearch();
  const { quote, party } = data;
  const [editing, setEditing] = useState(false);
  const open = quote.state === "draft" || quote.state === "sent";
  return (
    <div className="grid gap-8">
      <div className="grid gap-1 print:hidden">
        {party?.kind === "lead" ? (
          <Link
            to="/leads/$leadId"
            params={{ leadId: party.id }}
            className="text-sm text-muted-foreground hover:underline"
          >
            {party.name}
          </Link>
        ) : party ? (
          <Link
            to="/customers/$customerId"
            params={{ customerId: party.id }}
            className="text-sm text-muted-foreground hover:underline"
          >
            {party.name}
          </Link>
        ) : null}
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          Quote {quoteReference(quote.number, quote.version)}
          <Badge variant="secondary">{QUOTE_STATE_NAMES[quote.state]}</Badge>
          {open && quote.validUntil < data.today ? (
            <Badge variant="outline">Past its validity</Badge>
          ) : null}
        </h1>
        {data.versions.length > 1 ? (
          <p className="text-sm text-muted-foreground">
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
                    className="underline"
                  >
                    {version.version}
                  </Link>
                )}{" "}
                ({QUOTE_STATE_NAMES[version.state]})
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-sm text-muted-foreground">Print in</span>
        {(["en", "ar"] as const).map((choice) => (
          <Link
            key={choice}
            to="/quotes/$quoteId"
            params={{ quoteId: quote.id }}
            search={{ language: choice }}
            aria-current={choice === language ? "true" : undefined}
            className={buttonVariants({
              variant: choice === language ? "secondary" : "ghost",
              size: "sm",
            })}
          >
            {choice === "en" ? "English" : "Arabic"}
          </Link>
        ))}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <div className="max-w-3xl">
        <QuoteDocument
          quote={quote}
          party={
            party ?? { name: "", nameAr: null, address: null, taxNumber: null }
          }
          business={data.business}
          vatName={data.vatName}
          language={language}
        />
      </div>

      {quote.state === "accepted" ? (
        <section className="grid max-w-2xl gap-2 text-sm print:hidden">
          <h2 className="text-base font-semibold">Accepted</h2>
          <p>
            {quote.acceptedAt ? formatWhen(quote.acceptedAt) : ""}.{" "}
            <a href={`/quote-files/${quote.id}`} className="underline">
              {quote.attachmentName}
            </a>
          </p>
          {quote.draftId ? (
            <Link
              to="/provisioning/$draftId"
              params={{ draftId: quote.draftId }}
              className={buttonVariants({ className: "justify-self-start" })}
            >
              Set up its school
            </Link>
          ) : null}
        </section>
      ) : null}

      {open ? (
        <div className="grid gap-6 print:hidden">
          <span className="flex flex-wrap gap-2">
            {quote.state === "draft" ? <SendButton data={data} /> : null}
            <Button variant="outline" onClick={() => setEditing((on) => !on)}>
              {quote.state === "draft" ? "Change it" : "Make a new version"}
            </Button>
          </span>
          {editing ? <Change data={data} /> : null}
          <Accept data={data} />
        </div>
      ) : null}
    </div>
  );
}

function SendButton({ data }: { data: Data }) {
  const router = useRouter();
  const send = useServerFn(sendQuote);
  const [sending, setSending] = useState(false);
  return (
    <Button
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

function Change({ data }: { data: Data }) {
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
function Accept({ data }: { data: Data }) {
  const navigate = useNavigate();
  const send = useServerFn(accept);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label="Record acceptance"
      className="grid max-w-2xl gap-3 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file) return;
        setSaving(true);
        try {
          const form = new FormData();
          form.set("id", data.quote.id);
          form.set("attachment", file);
          const out = await send({ data: form });
          if (out.ok) {
            toast.success("Accepted. Its school is ready to set up.");
            await navigate({
              to: "/provisioning/$draftId",
              params: { draftId: out.draftId },
            });
          } else toast.error(out.message);
        } catch (error) {
          const said = failure(error, "The acceptance could not be recorded.");
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">Record acceptance</h2>
      <p className="text-sm text-muted-foreground">
        Attach the signed copy or the school's purchase order. Accepting makes
        its customer, if it has none, and begins its school's set-up with what
        the quote sells.
      </p>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="quote-signed" className="font-medium">
          Signed copy or purchase order
        </label>
        <Input
          id="quote-signed"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>
      <Button
        type="submit"
        disabled={saving || !file}
        className="justify-self-start"
      >
        {saving ? "Recording…" : "Record acceptance"}
      </Button>
    </form>
  );
}
