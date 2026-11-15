import type { Agreement } from "@faridalms/domain/agreements";

import { AGREEMENTS } from "@faridalms/domain/agreements";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import {
  CheckboxGroupField,
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { AgreementState } from "../server/agreement-state";

import { attempt, attemptWith } from "../actions";
import { AGREEMENT_LABELS, formatWhen } from "../format";
import { recordPaperAcceptance, sendForAcceptance } from "../server/agreements";

/** A version of an agreement and when it was accepted, if it was. */
export interface Acceptance {
  version: string | null;
  at: Date | null;
}

/** A customer's contact the console may write to. */
export interface AgreementContact {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
}

export interface AcceptedProps {
  held: Acceptance;
  /** The version in force, which the customer is asked to accept when it differs. */
  inForce: string | null;
  /** How the latest acceptance came, and who gave it. */
  by?: { method: "link" | "paper"; signer: string } | null;
}

/** Which version was accepted, when and how, or a warning that it never was. */
export function Accepted({ held, inForce, by }: AcceptedProps) {
  if (!held.version || !held.at)
    return <StatusText tone="warning">Not accepted</StatusText>;
  return (
    <span className="grid gap-0.5">
      <span>
        Version <span dir="ltr">{held.version}</span>, accepted{" "}
        {formatWhen(held.at)}
      </span>
      {by ? (
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {by.method === "link"
            ? `By ${by.signer}, through their link`
            : `Signed by ${by.signer}, recorded from the signed copy`}
        </span>
      ) : null}
      {inForce && inForce !== held.version ? (
        <StatusText tone="warning">
          Version <span dir="ltr">{inForce}</span> is in force now
        </StatusText>
      ) : null}
    </span>
  );
}

/** The summary rows for each agreement, as a record or the review step shows them. */
export function agreementRows(
  customer: {
    termsVersion: string | null;
    termsAcceptedAt: Date | null;
    dpaVersion: string | null;
    dpaAcceptedAt: Date | null;
  },
  state: AgreementState,
) {
  const latest = (kind: Agreement) => {
    const found = state.acceptances.find((row) => row.kind === kind);
    return found ? { method: found.method, signer: found.signerName } : null;
  };
  return AGREEMENTS.map((kind) => ({
    id: kind,
    label: AGREEMENT_LABELS[kind],
    value: (
      <Accepted
        held={
          kind === "terms"
            ? { version: customer.termsVersion, at: customer.termsAcceptedAt }
            : { version: customer.dpaVersion, at: customer.dpaAcceptedAt }
        }
        inForce={state.inForce[kind]}
        by={latest(kind)}
      />
    ),
  }));
}

/** Whether the customer holds every agreement at the version in force. */
export function agreementsDue(
  customer: { termsVersion: string | null; dpaVersion: string | null },
  state: AgreementState,
): Agreement[] {
  return AGREEMENTS.filter((kind) => {
    const inForce = state.inForce[kind];
    const held = kind === "terms" ? customer.termsVersion : customer.dpaVersion;
    return inForce !== null && held !== inForce;
  });
}

export interface SendForAcceptanceSheetProps {
  customerId: string;
  contacts: readonly AgreementContact[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Emails the contacts chosen a link each to read and accept the
 * agreements in force, which records their acceptance itself.
 */
export function SendForAcceptanceSheet({
  customerId,
  contacts,
  open,
  onOpenChange,
}: SendForAcceptanceSheetProps) {
  const router = useRouter();
  const send = useServerFn(sendForAcceptance);
  const reachable = contacts.filter((contact) => contact.email);
  const [chosen, setChosen] = useState<string[]>(() => {
    const deciding = reachable.filter((contact) =>
      contact.roles.includes("decision_maker"),
    );
    return (deciding.length ? deciding : reachable).map(
      (contact) => contact.id,
    );
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Send for acceptance"
      submitLabel="Send"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (chosen.length === 0) return;
        setPending(true);
        setError(null);
        const out = await attemptWith(
          () => send({ data: { customerId, contactIds: chosen } }),
          "The links could not be sent.",
        );
        setPending(false);
        if (!out.ok) {
          setError(out.message);
          return;
        }
        toast.success(
          chosen.length === 1
            ? "Sent. Their acceptance is recorded when they accept."
            : `Sent to ${chosen.length} people. The first to accept is recorded.`,
        );
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        Each gets an email with a link of their own to read the terms of service
        and the data processing agreement in force, and accept them for the
        customer. The link stands for 30 days.
      </p>
      {reachable.length ? (
        <CheckboxGroupField
          label="Send to"
          value={chosen}
          options={reachable.map((contact) => ({
            value: contact.id,
            label: contact.name,
            hint: contact.email ?? undefined,
          }))}
          onChange={setChosen}
          errors={
            submitted && chosen.length === 0
              ? ["Choose who to send it to."]
              : undefined
          }
        />
      ) : (
        <StatusText tone="warning">
          No contact has an email address. Add one first.
        </StatusText>
      )}
    </SheetForm>
  );
}

export interface PaperAcceptanceSheetProps {
  customerId: string;
  published: AgreementState["published"];
  inForce: AgreementState["inForce"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Records an agreement the customer signed on paper, with the signed copy. */
export function PaperAcceptanceSheet({
  customerId,
  published,
  inForce,
  open,
  onOpenChange,
}: PaperAcceptanceSheetProps) {
  const router = useRouter();
  const record = useServerFn(recordPaperAcceptance);
  const [kind, setKind] = useState<Agreement>("dpa");
  const [version, setVersion] = useState(inForce.dpa ?? "");
  const [signer, setSigner] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versions = published.filter((row) => row.kind === kind);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Record a signed copy"
      submitLabel="Record acceptance"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!version || !signer.trim() || !file) return;
        setPending(true);
        setError(null);
        const form = new FormData();
        form.set("customerId", customerId);
        form.set("kind", kind);
        form.set("version", version);
        form.set("signerName", signer.trim());
        form.set("signerTitle", title.trim());
        form.set("attachment", file);
        const failed = await attempt(
          () => record({ data: form }),
          "The acceptance could not be recorded.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Acceptance recorded.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      {published.length === 0 ? (
        <StatusText tone="warning">
          Nothing is published yet. Publish the terms and the data processing
          agreement in Settings first.
        </StatusText>
      ) : null}
      <SelectField
        label="Agreement"
        value={kind}
        options={AGREEMENTS.map((value) => ({
          value,
          label: AGREEMENT_LABELS[value],
        }))}
        onChange={(next) => {
          setKind(next);
          setVersion(inForce[next] ?? "");
        }}
      />
      <SelectField
        label="Version signed"
        value={version}
        options={[
          { value: "", label: "Choose…" },
          ...versions.map((row) => ({
            value: row.version,
            label:
              row.version === inForce[kind]
                ? `${row.version}, in force`
                : row.version,
          })),
        ]}
        onChange={setVersion}
        errors={
          submitted && !version ? ["Choose the version signed."] : undefined
        }
      />
      <div className="grid items-start gap-6 @md:grid-cols-2">
        <TextField
          label="Signed by"
          value={signer}
          onChange={(event) => setSigner(event.target.value)}
          errors={
            submitted && !signer.trim() ? ["Give who signed it."] : undefined
          }
        />
        <TextField
          label="Their title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <FormField
        label="Signed copy"
        hint="A PDF, PNG or JPEG of up to 10 MB."
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

export interface AgreementsProps {
  customer: {
    termsVersion: string | null;
    termsAcceptedAt: Date | null;
    dpaVersion: string | null;
    dpaAcceptedAt: Date | null;
  };
  state: AgreementState;
  onSend: () => void;
  onRecord: () => void;
}

/**
 * Which version of each agreement the customer accepted, and the two ways
 * to have it accepted: a link of the customer's own, or a signed copy.
 */
export function Agreements({
  customer,
  state,
  onSend,
  onRecord,
}: AgreementsProps) {
  return (
    <RecordSection
      variant="page"
      title="Agreements"
      description="A school is created only once its customer has accepted the data processing agreement."
      action={
        <span className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={onSend}
          >
            <Send aria-hidden />
            Send for acceptance
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={onRecord}
          >
            <FileSignature aria-hidden />
            Record a signed copy
          </Button>
        </span>
      }
    >
      <SummaryList align="start" items={agreementRows(customer, state)} />
    </RecordSection>
  );
}
