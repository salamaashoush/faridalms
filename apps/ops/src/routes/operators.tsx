import type { OperatorRole } from "@faridalms/domain/operators";

import { OPERATOR_ROLES } from "@faridalms/domain/operators";
import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { formatWhen } from "../format";
import { getOperators, saveOperator } from "../server/operators";

export const Route = createFileRoute("/operators")({
  loader: () => getOperators(),
  component: Operators,
});

const ROLE_LABEL: Record<OperatorRole, string> = {
  owner: "Owner",
  sales: "Sales",
  support: "Support",
  finance: "Finance",
};

const ROLE_HINT: Record<OperatorRole, string> = {
  owner: "Everything, including operators and the catalogue.",
  sales: "Leads, quotes and customers; reads schools.",
  support: "Schools, support requests and notices; reads billing.",
  finance: "Invoices, payments, credit notes and reports.",
};

type Row = Awaited<ReturnType<typeof getOperators>>["operators"][number];

function Operators() {
  const { me, operators } = Route.useLoaderData();
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Operators</h1>
        <p className="text-sm text-muted-foreground">
          Everyone who has signed in to the console. Someone new holds no role
          until an owner gives them one.
        </p>
      </div>
      <div className="grid gap-4">
        {operators.map((row) => (
          <OperatorCard key={row.id} row={row} self={row.id === me} />
        ))}
      </div>
    </div>
  );
}

function OperatorCard({ row, self }: { row: Row; self: boolean }) {
  const router = useRouter();
  const save = useServerFn(saveOperator);
  const [roles, setRoles] = useState<OperatorRole[]>(row.roles);
  const [active, setActive] = useState(row.state === "active");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const changed =
    active !== (row.state === "active") ||
    roles.length !== row.roles.length ||
    roles.some((role) => !row.roles.includes(role));
  return (
    <form
      aria-label={row.name}
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setAnswer(null);
        try {
          const out = await save({
            data: {
              id: row.id,
              roles,
              state: active ? "active" : "disabled",
              reason: reason.trim(),
            },
          });
          if (out.ok) {
            toast.success("Operator saved.");
            setReason("");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "The operator could not be saved."));
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{row.name}</h2>
        {self ? <Badge variant="secondary">You</Badge> : null}
        {row.state === "disabled" ? (
          <Badge variant="outline">Disabled</Badge>
        ) : null}
        <span className="text-sm text-muted-foreground">
          {[
            row.email,
            row.lastSignedInAt
              ? `last signed in ${formatWhen(row.lastSignedInAt)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <fieldset className="grid gap-2 text-sm">
        <legend className="mb-1 font-medium">Roles</legend>
        {OPERATOR_ROLES.map((role) => (
          <div key={role} className="flex items-start gap-2">
            <Checkbox
              id={`${row.id}-${role}`}
              checked={roles.includes(role)}
              onCheckedChange={(checked) =>
                setRoles((current) =>
                  checked
                    ? [...current, role]
                    : current.filter((item) => item !== role),
                )
              }
            />
            <label htmlFor={`${row.id}-${role}`} className="grid gap-0.5">
              <span className="font-medium">{ROLE_LABEL[role]}</span>
              <span className="text-xs text-muted-foreground">
                {ROLE_HINT[role]}
              </span>
            </label>
          </div>
        ))}
      </fieldset>
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id={`${row.id}-active`}
          checked={active}
          onCheckedChange={(checked) => setActive(checked)}
        />
        <label htmlFor={`${row.id}-active`}>
          Active; a disabled operator may do nothing in the console
        </label>
      </div>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor={`${row.id}-reason`} className="font-medium">
          Why
        </label>
        <Textarea
          id={`${row.id}-reason`}
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="For example: joined to handle invoices"
        />
      </div>
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={saving || !changed || !reason.trim()}
        className="justify-self-start"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
