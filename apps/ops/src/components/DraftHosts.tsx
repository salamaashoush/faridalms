import type { HostRole } from "@faridalms/domain/hosts";
import type { DraftAddresses } from "@faridalms/domain/provisioning-draft";
import type {
  Column,
  DataTableCard,
  RowAction,
} from "@faridalms/ui/system/data-table";

import { customHostnameSchema } from "@faridalms/domain/hosts";
import { Button } from "@faridalms/ui/button";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { Globe, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { HOST_ROLE_NAMES, HOST_ROLE_OPTIONS } from "../format";

export type DraftHost = DraftAddresses["hosts"][number];

/** A school of the draft, as its hosts name it. */
export interface DraftHostSchool {
  label: string;
}

export interface HostSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The host being changed, or null for a new one. */
  host: DraftHost | null;
  /** The draft's other hosts, which this one may not repeat. */
  others: readonly DraftHost[];
  schools: readonly DraftHostSchool[];
  /** Saves the host; answers what went wrong, or null. */
  onSave: (host: DraftHost) => Promise<string | null>;
}

/** One host of a school's own: its name, which school it is for and what it serves. */
export function HostSheet({
  open,
  onOpenChange,
  host,
  others,
  schools,
  onSave,
}: HostSheetProps) {
  const [hostname, setHostname] = useState(host?.hostname ?? "");
  const [schoolIndex, setSchoolIndex] = useState(host?.schoolIndex ?? 0);
  const [role, setRole] = useState<HostRole>(host?.role ?? "site");
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = v.safeParse(customHostnameSchema, hostname);
  const problem = !parsed.success
    ? "Use a domain name such as www.example.com."
    : others.some((other) => other.hostname === parsed.output)
      ? "It is already one of its hosts."
      : null;
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={host ? `Edit ${host.hostname}` : "Add a host"}
      submitLabel={host ? "Save host" : "Add host"}
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
        if (!parsed.success || problem) return;
        setSaving(true);
        setAnswer(null);
        const failed = await onSave({
          hostname: parsed.output,
          schoolIndex,
          role,
        });
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        onOpenChange(false);
      }}
    >
      <TextField
        label="Hostname"
        hint="A name the school publishes DNS records for, such as www.example.com."
        dir="ltr"
        autoComplete="off"
        spellCheck={false}
        value={hostname}
        errors={submitted && problem ? [problem] : undefined}
        onChange={(event) => setHostname(event.target.value)}
      />
      {schools.length > 1 ? (
        <SelectField
          label="School"
          value={String(schoolIndex)}
          options={schools.map((school, index) => ({
            value: String(index),
            label: school.label,
          }))}
          onChange={(chosen) => setSchoolIndex(Number(chosen))}
        />
      ) : null}
      <SelectField
        label="Serves"
        value={role}
        options={HOST_ROLE_OPTIONS}
        onChange={setRole}
      />
    </SheetForm>
  );
}

interface HostRow extends DraftHost {
  id: string;
  index: number;
}

/** The table's columns and phone cards; School shows only for a group. */
function hostTable(
  schools: readonly DraftHostSchool[],
  onEdit: (row: HostRow) => void,
) {
  const opener = (row: HostRow) => (
    <RowButton
      aria-label={`Edit ${row.hostname}`}
      dir="ltr"
      className="font-mono text-[13px]"
      onClick={() => onEdit(row)}
    >
      {row.hostname}
    </RowButton>
  );
  const schoolOf = (row: HostRow) =>
    schools[row.schoolIndex]?.label ?? `School ${row.schoolIndex + 1}`;
  const columns: Column<HostRow>[] = [
    {
      id: "hostname",
      header: "Hostname",
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center">{opener(row)}</span>
      ),
    },
    ...(schools.length > 1
      ? [{ id: "school", header: "School", cell: schoolOf }]
      : []),
    {
      id: "serves",
      header: "Serves",
      cell: (row) => HOST_ROLE_NAMES[row.role],
    },
  ];
  const card: DataTableCard<HostRow> = {
    title: opener,
    fact: (row) =>
      schools.length > 1
        ? `${HOST_ROLE_NAMES[row.role]} of ${schoolOf(row)}`
        : HOST_ROLE_NAMES[row.role],
  };
  return { columns, card };
}

/** What changed among the hosts, for the page to say so. */
export type HostChange = "added" | "changed" | "removed";

export interface DraftHostsProps {
  hosts: readonly DraftHost[];
  schools: readonly DraftHostSchool[];
  /** Saves the hosts with one added, changed or removed; answers what went wrong, or null. */
  onSave: (hosts: DraftHost[], change: HostChange) => Promise<string | null>;
}

/**
 * The hosts of a new school's own as a table: Add host, or a host's row,
 * opens that one in a sheet, and each is saved to the draft as its sheet
 * is. They are created pending with the school.
 */
export function DraftHosts({ hosts, schools, onSave }: DraftHostsProps) {
  const adding = useSheet();
  const editing = useSheet();
  const [chosen, setChosen] = useState<number | null>(null);
  const rows: HostRow[] = hosts.map((host, index) => ({
    ...host,
    id: `host-${index}`,
    index,
  }));
  const edit = (row: HostRow) => {
    setChosen(row.index);
    editing.show();
  };
  const { columns, card } = hostTable(schools, edit);
  const rowActions = (row: HostRow): RowAction[] => [
    { label: "Edit", icon: Pencil, onSelect: () => edit(row) },
    {
      label: "Remove",
      icon: Trash2,
      destructive: true,
      confirm: {
        title: `Remove ${row.hostname}?`,
        body: "It is not added when the school is created.",
        label: "Remove",
      },
      onSelect: async () => {
        const failed = await onSave(
          hosts.filter((_, index) => index !== row.index),
          "removed",
        );
        if (failed) toast.error(failed);
      },
    },
  ];
  const add = (
    <Button type="button" variant="outline" size="sm" onClick={adding.show}>
      <Plus aria-hidden />
      Add host
    </Button>
  );
  const editingHost = chosen === null ? undefined : hosts[chosen];
  return (
    <>
      <DataTable
        caption="Hosts of their own"
        rows={rows}
        columns={columns}
        rowLabel={(row) => row.hostname}
        card={card}
        rowActions={rowActions}
        actions={add}
        empty={{
          icon: Globe,
          title: "Add a host of the school's own",
          description:
            "Optional: the platform's own addresses work from the start.",
          action: add,
          placement: "section",
        }}
      />
      <HostSheet
        key={`add-${adding.key}`}
        open={adding.open}
        onOpenChange={adding.onOpenChange}
        host={null}
        others={hosts}
        schools={schools}
        onSave={(host) => onSave([...hosts, host], "added")}
      />
      {editingHost && chosen !== null ? (
        <HostSheet
          key={`edit-${editing.key}`}
          open={editing.open}
          onOpenChange={editing.onOpenChange}
          host={editingHost}
          others={hosts.filter((_, index) => index !== chosen)}
          schools={schools}
          onSave={(host) =>
            onSave(
              hosts.map((kept, index) => (index === chosen ? host : kept)),
              "changed",
            )
          }
        />
      ) : null}
    </>
  );
}
