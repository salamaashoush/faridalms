import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { formatWhen } from "../format";
import { recordAgreement } from "../server/customers";

const accepted = (held: { version: string | null; at: Date | null }) =>
  held.version && held.at
    ? `version ${held.version}, accepted ${formatWhen(held.at)}`
    : "Not accepted";

/** Which version of the terms and of the data processing agreement it accepted. */
export function Agreements({
  customerId,
  terms,
  dpa,
}: {
  customerId: string;
  terms: { version: string | null; at: Date | null };
  dpa: { version: string | null; at: Date | null };
}) {
  const router = useRouter();
  const record = useServerFn(recordAgreement);
  const [agreement, setAgreement] = useState<"terms" | "dpa">("terms");
  const [version, setVersion] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <section className="grid max-w-2xl gap-4 rounded-lg border p-6">
      <h2 className="text-base font-semibold">Agreements</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Terms of service</dt>
          <dd>{accepted(terms)}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Data processing agreement</dt>
          <dd>{accepted(dpa)}</dd>
        </div>
      </dl>
      <form
        aria-label="Record an acceptance"
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await record({ data: { customerId, agreement, version } });
            toast.success("Acceptance recorded.");
            setVersion("");
            await router.invalidate();
          } catch (error) {
            const said = failure(
              error,
              "The acceptance could not be recorded.",
            );
            if (said) toast.error(said);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid gap-1 text-sm">
          <label htmlFor="agreement-kind" className="font-medium">
            Agreement
          </label>
          <select
            id="agreement-kind"
            value={agreement}
            onChange={(event) =>
              setAgreement(event.target.value as "terms" | "dpa")
            }
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="terms">Terms of service</option>
            <option value="dpa">Data processing agreement</option>
          </select>
        </div>
        <div className="grid gap-1 text-sm">
          <label htmlFor="agreement-version" className="font-medium">
            Version accepted
          </label>
          <Input
            id="agreement-version"
            required
            dir="ltr"
            maxLength={40}
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            placeholder="2026-11"
          />
        </div>
        <Button type="submit" disabled={saving || !version.trim()}>
          {saving ? "Recording…" : "Record acceptance"}
        </Button>
      </form>
    </section>
  );
}
