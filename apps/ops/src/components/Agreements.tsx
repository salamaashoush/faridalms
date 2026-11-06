import { Button } from "@faridalms/ui/button";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Fact, Facts, RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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

const accepted = (held: Acceptance) =>
  held.version && held.at
    ? `Version ${held.version}, accepted ${formatWhen(held.at)}`
    : "Not accepted";

export interface AgreementsProps {
  customerId: string;
  terms: Acceptance;
  dpa: Acceptance;
}

/** Which version of the terms and of the data processing agreement it accepted. */
export function Agreements({ customerId, terms, dpa }: AgreementsProps) {
  const router = useRouter();
  const record = useServerFn(recordAgreement);
  const [open, setOpen] = useState(false);
  const [agreement, setAgreement] = useState<Agreement>("terms");
  const [version, setVersion] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <RecordSection
      title="Agreements"
      action={
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
          Record acceptance
        </Button>
      }
    >
      <Facts>
        <Fact label="Terms of service">{accepted(terms)}</Fact>
        <Fact label="Data processing agreement">{accepted(dpa)}</Fact>
      </Facts>
      <SheetForm
        open={open}
        onOpenChange={setOpen}
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
          setVersion("");
          setSubmitted(false);
          setOpen(false);
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
    </RecordSection>
  );
}
