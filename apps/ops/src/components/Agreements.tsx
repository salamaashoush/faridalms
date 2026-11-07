import { Button } from "@faridalms/ui/button";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { formatWhen } from "../format";
import { recordAgreement } from "../server/customers";

/** A version of an agreement and when it was accepted, if it was. */
export interface Acceptance {
  version: string | null;
  at: Date | null;
}

type Agreement = "terms" | "dpa";

const AGREEMENT_OPTIONS = [
  { value: "terms", label: "Terms of service" },
  { value: "dpa", label: "Data processing agreement" },
] as const;

export interface AgreementSheetProps {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Records which version of the terms or the data processing agreement was accepted. */
export function AgreementSheet({
  customerId,
  open,
  onOpenChange,
}: AgreementSheetProps) {
  const router = useRouter();
  const record = useServerFn(recordAgreement);
  const [agreement, setAgreement] = useState<Agreement>("terms");
  const [version, setVersion] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Record an acceptance"
      submitLabel="Record acceptance"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!version.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () => record({ data: { customerId, agreement, version } }),
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
      <SelectField
        label="Agreement"
        value={agreement}
        options={AGREEMENT_OPTIONS}
        onChange={setAgreement}
      />
      <TextField
        label="Version accepted"
        dir="ltr"
        width="code"
        maxLength={40}
        placeholder="2026-11"
        value={version}
        errors={
          submitted && !version.trim() ? ["Enter the version."] : undefined
        }
        onChange={(event) => setVersion(event.target.value)}
      />
    </SheetForm>
  );
}

export interface AcceptedProps {
  held: Acceptance;
}

/** Which version was accepted and when, or a warning that it never was. */
export function Accepted({ held }: AcceptedProps) {
  return held.version && held.at ? (
    <span>
      Version <span dir="ltr">{held.version}</span>, accepted{" "}
      {formatWhen(held.at)}
    </span>
  ) : (
    <StatusText tone="warning">Not accepted</StatusText>
  );
}

export interface AgreementsProps {
  customerId: string;
  terms: Acceptance;
  dpa: Acceptance;
  /** Opens the sheet that records an acceptance, owned by the page. */
  onRecord?: () => void;
}

/** Which version of the terms and of the data processing agreement it accepted. */
export function Agreements({
  customerId,
  terms,
  dpa,
  onRecord,
}: AgreementsProps) {
  const sheet = useSheet();
  return (
    <RecordSection
      variant="page"
      title="Agreements"
      description="A school is created only once its customer has accepted the data processing agreement."
      action={
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={onRecord ?? sheet.show}
        >
          <FileSignature aria-hidden />
          Record acceptance
        </Button>
      }
    >
      <SummaryList
        align="start"
        items={[
          {
            id: "terms",
            label: "Terms of service",
            value: <Accepted held={terms} />,
          },
          {
            id: "dpa",
            label: "Data processing agreement",
            value: <Accepted held={dpa} />,
          },
        ]}
      />
      {onRecord ? null : (
        <AgreementSheet
          key={sheet.key}
          customerId={customerId}
          open={sheet.open}
          onOpenChange={sheet.onOpenChange}
        />
      )}
    </RecordSection>
  );
}
