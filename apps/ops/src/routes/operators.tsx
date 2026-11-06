import type { OperatorRole } from "@faridalms/domain/operators";
import type { Column } from "@faridalms/ui/system/data-table";

import { OPERATOR_ROLES } from "@faridalms/domain/operators";
import { DataTable } from "@faridalms/ui/system/data-table";
import { CheckboxGroupField } from "@faridalms/ui/system/form-field";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { WhyField } from "../components/Why";
import {
  formatWhen,
  OPERATOR_ROLE_HINTS,
  OPERATOR_ROLE_NAMES,
} from "../format";
import { getOperators, saveOperator } from "../server/operators";

export const Route = createFileRoute("/operators")({
  loader: () => getOperators(),
  component: Operators,
});

type Row = Awaited<ReturnType<typeof getOperators>>["operators"][number];

const ROLE_OPTIONS = OPERATOR_ROLES.map((role) => ({
  value: role,
  label: OPERATOR_ROLE_NAMES[role],
  hint: OPERATOR_ROLE_HINTS[role],
}));

function columnsFor(me: string): Column<Row>[] {
  return [
    {
      id: "operator",
      header: "Operator",
      primary: true,
      cell: (row) => (
        <span className="grid min-w-0">
          <span className="flex items-center gap-2 truncate font-medium">
            {row.name}
            {row.id === me ? (
              <StatusBadge tone="accent">You</StatusBadge>
            ) : null}
          </span>
          {row.email ? (
            <span
              dir="ltr"
              className="justify-self-start truncate text-[13px] leading-[18px] text-muted-foreground"
            >
              {row.email}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      cell: (row) =>
        row.roles.length ? (
          row.roles.map((role) => OPERATOR_ROLE_NAMES[role]).join(", ")
        ) : (
          <span className="text-muted-foreground">No role yet</span>
        ),
    },
    {
      id: "state",
      header: "State",
      cell: (row) =>
        row.state === "active" ? (
          <StatusText tone="success">Active</StatusText>
        ) : (
          <StatusText tone="neutral">Disabled</StatusText>
        ),
    },
    {
      id: "seen",
      header: "Last signed in",
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.lastSignedInAt ? formatWhen(row.lastSignedInAt) : "Never"}
        </span>
      ),
    },
  ];
}

/**
 * Everyone who has signed in to the console. Someone new holds no role
 * until an owner gives them one.
 */
function Operators() {
  const { me, operators } = Route.useLoaderData();
  const [editing, setEditing] = useState<Row | null>(null);
  return (
    <>
      <PageHeader
        title="Operators"
        count={operators.length}
        description="Someone new holds no role until an owner gives them one."
      />
      <DataTable
        caption="Operators"
        rows={operators}
        columns={columnsFor(me)}
        rowLabel={(row) => row.name}
        rowActions={(row) => [
          {
            label: "Change",
            icon: Pencil,
            inline: true,
            onSelect: () => setEditing(row),
          },
        ]}
        card={{
          title: (row) => row.name,
          fact: (row) =>
            row.roles.map((role) => OPERATOR_ROLE_NAMES[role]).join(", ") ||
            "No role yet",
        }}
        empty={{
          icon: Users,
          title: "Nobody has signed in yet",
          description: "Operators appear once they first sign in.",
        }}
      />
      {editing ? (
        <OperatorSheet
          key={editing.id}
          row={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

interface OperatorSheetProps {
  row: Row;
  onClose: () => void;
}

/** An operator's roles and whether they may act, changed with a reason. */
function OperatorSheet({ row, onClose }: OperatorSheetProps) {
  const router = useRouter();
  const save = useServerFn(saveOperator);
  const [roles, setRoles] = useState<OperatorRole[]>(row.roles);
  const [active, setActive] = useState(row.state === "active");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed =
    active !== (row.state === "active") ||
    roles.length !== row.roles.length ||
    roles.some((role) => !row.roles.includes(role));
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={row.name}
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!changed || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            save({
              data: {
                id: row.id,
                roles,
                state: active ? "active" : "disabled",
                reason: reason.trim(),
              },
            }),
          "The operator could not be saved.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Operator saved.");
        onClose();
        await router.invalidate();
      }}
    >
      <CheckboxGroupField
        label="Roles"
        value={roles}
        options={ROLE_OPTIONS}
        onChange={setRoles}
        errors={
          submitted && !changed
            ? ["Change a role or the state to save."]
            : undefined
        }
      />
      <CheckboxGroupField
        label="State"
        value={active ? ["active"] : []}
        options={[
          {
            value: "active",
            label: "Active",
            hint: "A disabled operator may do nothing in the console.",
          },
        ]}
        onChange={(value) => setActive(value.includes("active"))}
      />
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: joined to handle invoices"
      />
    </SheetForm>
  );
}
