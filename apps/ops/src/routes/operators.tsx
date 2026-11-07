import type { BusinessEventRow } from "@faridalms/database/business/events";
import type { OperatorRole } from "@faridalms/domain/operators";
import type { AttentionItem } from "@faridalms/ui/system/attention-list";
import type { ChangeEntry } from "@faridalms/ui/system/change-log";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";
import type { RecordTab } from "@faridalms/ui/system/record-page";
import type { Tone } from "@faridalms/ui/system/status";

import { OPERATOR_ROLES, QUIET_DAYS } from "@faridalms/domain/operators";
import { Button } from "@faridalms/ui/button";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { ChangeLog } from "@faridalms/ui/system/change-log";
import { DataTable } from "@faridalms/ui/system/data-table";
import { CheckboxGroupField } from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { Admission } from "../server/operators";

import { attempt } from "../actions";
import { ReasonSheet } from "../components/ReasonSheet";
import { WhyField } from "../components/Why";
import {
  formatWhen,
  formatWhenDay,
  OPERATOR_ROLE_HINTS,
  OPERATOR_ROLE_NAMES,
} from "../format";
import { getOperators, saveOperator } from "../server/operators";

const TABS = ["operators", "history"] as const;
type Tab = (typeof TABS)[number];

/** Where a person stands: working, waiting for a role, taken off, or not in yet. */
const ACCESS = ["active", "waiting", "removed", "invited"] as const;
type Access = (typeof ACCESS)[number];

/** The role facet's value for someone who holds none. */
const NO_ROLE = "none";
const ROLE_FILTERS = [...OPERATOR_ROLES, NO_ROLE] as const;

const search = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS)), undefined),
  q: v.optional(v.string(), ""),
  role: v.fallback(v.optional(v.array(v.picklist(ROLE_FILTERS)), []), []),
  access: v.fallback(v.optional(v.array(v.picklist(ACCESS)), []), []),
});

export const Route = createFileRoute("/operators")({
  validateSearch: search,
  search: {
    middlewares: [stripSearchParams({ q: "", role: [], access: [] })],
  },
  loader: () => getOperators(),
  component: Operators,
});

type Data = Awaited<ReturnType<typeof getOperators>>;
type Operator = Data["operators"][number];

/** A row of the table: someone who signed in, or an admitted address nobody has used. */
interface Person {
  id: string;
  name: string;
  email: string | null;
  roles: OperatorRole[];
  access: Access;
  lastSignedInAt: string | null;
  operator: Operator | null;
}

const ACCESS_NAMES: Record<Access, string> = {
  active: "Active",
  waiting: "Waiting for a role",
  removed: "Removed",
  invited: "Not signed in yet",
};

const ACCESS_TONE: Record<Access, Tone> = {
  active: "success",
  waiting: "warning",
  removed: "neutral",
  invited: "neutral",
};

function personOf(operator: Operator): Person {
  return {
    id: operator.id,
    name: operator.name,
    email: operator.email,
    roles: operator.roles,
    access:
      operator.state === "disabled"
        ? "removed"
        : operator.roles.length
          ? "active"
          : "waiting",
    lastSignedInAt: operator.lastSignedInAt,
    operator,
  };
}

const roleList = (roles: readonly OperatorRole[]) =>
  roles.map((role) => OPERATOR_ROLE_NAMES[role]).join(", ");

const ROLE_OPTIONS = OPERATOR_ROLES.map((role) => ({
  value: role,
  label: OPERATOR_ROLE_NAMES[role],
  hint: OPERATOR_ROLE_HINTS[role],
}));

function columnsFor(me: string): Column<Person>[] {
  return [
    {
      id: "operator",
      header: "Operator",
      primary: true,
      cell: (person) => (
        <span className="grid min-w-0 py-2">
          <span className="flex min-w-0 items-center gap-2 font-medium">
            <span dir="auto" className="truncate">
              {person.name}
            </span>
            {person.id === me ? (
              <StatusBadge tone="accent">You</StatusBadge>
            ) : null}
          </span>
          {person.email && person.email !== person.name ? (
            <span
              dir="ltr"
              className="justify-self-start truncate text-[13px] leading-[18px] text-muted-foreground"
            >
              {person.email}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      cell: (person) =>
        person.access === "invited" ? (
          <Value notApplicable>{null}</Value>
        ) : person.roles.length ? (
          <span
            className={
              person.access === "removed" ? "text-muted-foreground" : undefined
            }
          >
            {roleList(person.roles)}
          </span>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
    },
    {
      id: "access",
      header: "Access",
      cell: (person) => (
        <StatusBadge tone={ACCESS_TONE[person.access]}>
          {ACCESS_NAMES[person.access]}
        </StatusBadge>
      ),
    },
    {
      id: "seen",
      header: "Last signed in",
      cell: (person) => (
        <span className="text-muted-foreground">
          {person.lastSignedInAt ? formatWhen(person.lastSignedInAt) : "Never"}
        </span>
      ),
    },
  ];
}

const CARD: DataTableCard<Person> = {
  title: (person) => person.name,
  status: (person) => (
    <StatusBadge tone={ACCESS_TONE[person.access]}>
      {ACCESS_NAMES[person.access]}
    </StatusBadge>
  ),
  fact: (person) =>
    person.access === "invited"
      ? "Can sign in"
      : roleList(person.roles) || "No role",
};

function admissionLine(admission: Admission): string {
  if (admission.kind === "group")
    return `Anyone in the identity provider's group “${admission.group}” may sign in; what each person may do is set here.`;
  return `The console admits ${admission.count.toLocaleString("en")} email ${admission.count === 1 ? "address" : "addresses"}; what each person may do is set here.`;
}

const fieldsOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const isRole = (value: unknown): value is OperatorRole =>
  OPERATOR_ROLES.some((role) => role === value);

/** The roles and access an event recorded on one side of a change. */
function accessIn(value: unknown) {
  const fields = fieldsOf(value);
  return {
    roles: Array.isArray(fields.roles) ? fields.roles.filter(isRole) : [],
    removed: fields.state === "disabled",
  };
}

/**
 * Access given and taken as the change log reads it: whose, what was done,
 * and the roles it moved.
 */
function historyOf(
  events: readonly BusinessEventRow[],
  names: Record<string, string>,
): ChangeEntry[] {
  return events.map((event) => {
    const subject = names[event.subjectId] ?? "A former operator";
    const before = accessIn(event.before);
    const after = accessIn(event.after);
    const rolesMoved = roleList(before.roles) !== roleList(after.roles);
    const what =
      event.action === "operator.first_owner"
        ? "became the first owner"
        : before.removed !== after.removed
          ? after.removed
            ? "access removed"
            : "access restored"
          : before.roles.length === 0
            ? "roles given"
            : "roles changed";
    return {
      id: event.id,
      what: `${subject}: ${what}`,
      details:
        event.action === "operator.update" && rolesMoved
          ? [
              `Roles: ${roleList(before.roles) || "none"} → ${roleList(after.roles) || "none"}`,
            ]
          : [],
      why: event.reason,
      who: names[event.operatorId] ?? "A former operator",
      when: formatWhen(event.occurredAt),
      at: new Date(event.occurredAt).toISOString(),
    };
  });
}

/** What an access change asks for: roles to set, or access to take or give back. */
type Editing =
  | { kind: "roles"; operator: Operator }
  | { kind: "remove" | "restore"; operator: Operator };

/**
 * Who may work in the console and as what. Who may sign in is the identity
 * provider's to decide; a person appears here once they first sign in and
 * holds no role until an owner gives them one.
 */
function Operators() {
  const data = Route.useLoaderData();
  const { me, admission, operators, notSignedIn, events, names } = data;
  const { tab: chosen, q, role, access } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [editing, setEditing] = useState<Editing | null>(null);
  const tab = chosen ?? "operators";
  const go = (next: Partial<v.InferOutput<typeof search>>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...next }),
      replace: true,
      resetScroll: false,
    });

  const people: Person[] = [
    ...operators.map(personOf),
    ...notSignedIn.map((email) => ({
      id: `address:${email}`,
      name: email,
      email,
      roles: [],
      access: "invited" as const,
      lastSignedInAt: null,
      operator: null,
    })),
  ];
  const owners = operators.filter(
    (operator) =>
      operator.state === "active" && operator.roles.includes("owner"),
  );
  const needle = q.trim().toLowerCase();
  const rows = people.filter(
    (person) =>
      (!needle ||
        [person.name, person.email ?? ""].some((text) =>
          text.toLowerCase().includes(needle),
        )) &&
      (role.length === 0 ||
        (person.roles.length === 0
          ? role.includes(NO_ROLE)
          : person.roles.some((held) => role.includes(held)))) &&
      (access.length === 0 || access.includes(person.access)),
  );

  const waiting = operators.filter(
    (operator) => operator.state === "active" && operator.roles.length === 0,
  );
  const stale = operators.filter(
    (operator) =>
      operator.id !== me &&
      operator.state === "active" &&
      operator.roles.length > 0 &&
      operator.quiet,
  );
  const items: AttentionItem[] = [
    ...waiting.map((operator) => ({
      id: `waiting:${operator.id}`,
      tone: "warning" as const,
      title: `${operator.name} is waiting for a role`,
      detail: `Signed in ${operator.lastSignedInAt ? formatWhen(operator.lastSignedInAt) : ""}${operator.email && operator.email !== operator.name ? ` as ${operator.email}` : ""}. They see nothing until they have one.`,
      action: (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-10"
          aria-label={`Give ${operator.name} roles`}
          onClick={() => setEditing({ kind: "roles", operator })}
        >
          Give roles
        </Button>
      ),
    })),
    ...stale.map((operator) => ({
      id: `stale:${operator.id}`,
      tone: "info" as const,
      title: `${operator.name} has not signed in since ${operator.lastSignedInAt ? formatWhenDay(operator.lastSignedInAt) : "they were given a role"}`,
      detail: `Over ${QUIET_DAYS} days. Remove their access if they no longer work here.`,
      action: (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-10"
          aria-label={`Remove ${operator.name}'s access`}
          onClick={() => setEditing({ kind: "remove", operator })}
        >
          Remove access
        </Button>
      ),
    })),
  ];

  const facets: Facet[] = [
    {
      id: "role",
      label: "Role",
      options: ROLE_FILTERS.map((value) => ({
        value,
        label: value === NO_ROLE ? "No role" : OPERATOR_ROLE_NAMES[value],
        count: people.filter((person) =>
          value === NO_ROLE
            ? person.roles.length === 0
            : person.roles.includes(value),
        ).length,
      })),
      selected: role,
      onChange: (selected) =>
        go({ role: ROLE_FILTERS.filter((value) => selected.includes(value)) }),
    },
    {
      id: "access",
      label: "Access",
      options: ACCESS.filter(
        (value) =>
          value !== "invited" ||
          people.some((person) => person.access === value),
      ).map((value) => ({
        value,
        label: ACCESS_NAMES[value],
        count: people.filter((person) => person.access === value).length,
      })),
      selected: access,
      onChange: (selected) =>
        go({ access: ACCESS.filter((value) => selected.includes(value)) }),
    },
  ];

  const tabs: RecordTab<Tab>[] = [
    { value: "operators", label: "Operators", count: people.length },
    { value: "history", label: "History" },
  ];

  return (
    <Page width="list">
      <PageHeader title="Operators" description={admissionLine(admission)} />
      <div className="grid gap-6">
        <AttentionList title="To do" items={items} />
        <RecordTabs
          label="Operators and their history"
          tabs={tabs}
          value={tab}
          onChange={(next) =>
            go({ tab: next === "operators" ? undefined : next })
          }
        >
          {tab === "history" ? (
            <ChangeLog
              labels={{
                caption: "Access history",
                what: "Change",
                why: "Why",
                who: "By",
                when: "When",
                empty: "Nobody's access has changed yet",
                emptyHint:
                  "Each role given or taken and each access removed shows here, with who did it and why.",
              }}
              entries={historyOf(events, names)}
            />
          ) : (
            <DataTable
              caption="Operators"
              rows={rows}
              columns={columnsFor(me)}
              rowLabel={(person) => person.name}
              toolbar={{
                search: {
                  value: q,
                  onChange: (value) => go({ q: value }),
                  label: "Search operators",
                  placeholder: "Search by name or email",
                },
                facets,
                onReset: () => go({ q: "", role: [], access: [] }),
              }}
              rowActions={(person) => {
                const operator = person.operator;
                if (!operator) return [];
                return [
                  {
                    label: "Change roles",
                    icon: Pencil,
                    inline: true,
                    onSelect: () => setEditing({ kind: "roles", operator }),
                  },
                  ...(operator.id === me
                    ? []
                    : operator.state === "active"
                      ? [
                          {
                            label: "Remove access",
                            onSelect: () =>
                              setEditing({ kind: "remove", operator }),
                          },
                        ]
                      : [
                          {
                            label: "Restore access",
                            onSelect: () =>
                              setEditing({ kind: "restore", operator }),
                          },
                        ]),
                ];
              }}
              card={CARD}
              empty={{
                icon: Users,
                title: "Sign in to see the console's operators",
                description:
                  "Everyone the identity provider lets in appears here once they first sign in.",
              }}
            />
          )}
        </RecordTabs>
      </div>
      {editing?.kind === "roles" ? (
        <RolesSheet
          key={editing.operator.id}
          operator={editing.operator}
          soleOwner={
            owners.length === 1 && owners[0]?.id === editing.operator.id
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing && editing.kind !== "roles" ? (
        <AccessSheet
          key={`${editing.kind}:${editing.operator.id}`}
          operator={editing.operator}
          remove={editing.kind === "remove"}
          soleOwner={
            owners.length === 1 && owners[0]?.id === editing.operator.id
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Page>
  );
}

const LAST_OWNER =
  "The console needs at least one active owner. Make someone else an owner first.";

interface RolesSheetProps {
  operator: Operator;
  /** The only active owner: taking Owner from them would lock everyone out. */
  soleOwner: boolean;
  onClose: () => void;
}

/** An operator's roles, each with what it opens, changed with a reason. */
function RolesSheet({ operator, soleOwner, onClose }: RolesSheetProps) {
  const router = useRouter();
  const save = useServerFn(saveOperator);
  const [roles, setRoles] = useState<OperatorRole[]>(operator.roles);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed =
    roles.length !== operator.roles.length ||
    roles.some((role) => !operator.roles.includes(role));
  const leavesNoOwner =
    soleOwner && operator.state === "active" && !roles.includes("owner");
  const rolesError = !submitted
    ? undefined
    : leavesNoOwner
      ? [LAST_OWNER]
      : !changed
        ? ["Give or take away a role to save."]
        : undefined;
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={operator.name}
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!changed || leavesNoOwner || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            save({
              data: {
                id: operator.id,
                roles,
                state: operator.state,
                reason: reason.trim(),
              },
            }),
          "The roles could not be saved.",
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
        hint={
          operator.state === "disabled"
            ? "Their access is removed; these apply once it is restored."
            : undefined
        }
        value={roles}
        options={ROLE_OPTIONS}
        onChange={setRoles}
        errors={rolesError}
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

interface AccessSheetProps {
  operator: Operator;
  /** Takes access away; otherwise gives it back. */
  remove: boolean;
  soleOwner: boolean;
  onClose: () => void;
}

/**
 * Takes an operator's access away, or gives it back, keeping their roles
 * for when it is restored.
 */
function AccessSheet({
  operator,
  remove,
  soleOwner,
  onClose,
}: AccessSheetProps) {
  const router = useRouter();
  const save = useServerFn(saveOperator);
  return (
    <ReasonSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        remove
          ? `Remove ${operator.name}'s access`
          : `Restore ${operator.name}'s access`
      }
      submitLabel={remove ? "Remove access" : "Restore access"}
      destructive={remove}
      placeholder={
        remove
          ? "For example: left the company"
          : "For example: back from leave"
      }
      onSubmit={async (reason) => {
        if (remove && soleOwner) return LAST_OWNER;
        const failed = await attempt(
          () =>
            save({
              data: {
                id: operator.id,
                roles: operator.roles,
                state: remove ? "disabled" : "active",
                reason,
              },
            }),
          remove
            ? "Their access could not be removed."
            : "Their access could not be restored.",
        );
        if (failed) return failed;
        toast.success(remove ? "Access removed." : "Access restored.");
        await router.invalidate();
        return null;
      }}
    />
  );
}
