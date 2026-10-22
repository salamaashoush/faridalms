import type { CasePackage } from "@faridalms/domain/standards";

import { EYFS_GOALS } from "@faridalms/domain/early-goals";
import { IB_CONCEPTS } from "@faridalms/domain/ib-concepts";
import {
  casePackageSchema,
  caseOutline,
  MAX_FRAMEWORK_DESCRIPTION,
  MAX_FRAMEWORK_TITLE,
  MAX_ITEM_TYPE,
  MAX_STANDARD_CODE,
  MAX_STANDARD_STATEMENT,
} from "@faridalms/domain/standards";
import { Button } from "@faridalms/ui/button";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { ActionItem } from "~/components/system/ActionMenu";
import type { frameworkQuery } from "~/queries/standards";

import { CheckboxRow } from "~/components/people/fields";
import { ActionMenu } from "~/components/system/ActionMenu";
import { ComboboxField } from "~/components/system/ComboboxField";
import { FormField, TextField } from "~/components/system/field";
import {
  FilteredEmptyState,
  IndexToolbar,
} from "~/components/system/IndexPage";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import {
  importCase,
  moveStandard,
  removeStandard,
  saveFramework,
  saveStandard,
} from "~/server/standards";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type FrameworkData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof frameworkQuery>["queryFn"]>>
>;
export type StandardRow = FrameworkData["standards"][number];
type FrameworkRow = FrameworkData["framework"];

/** Where a framework came from: the EYFS goals, the IB's concepts, a CASE package, or the school. */
export const sourceOf = (framework: { caseIdentifier: string | null }) =>
  framework.caseIdentifier === EYFS_GOALS.identifier
    ? m.standardsSourceEyfs()
    : IB_CONCEPTS.some((row) => row.identifier === framework.caseIdentifier)
      ? m.standardsSourceIb()
      : framework.caseIdentifier
        ? m.standardsSourceCase()
        : m.standardsSourceOwn();

/** A framework's name and what it is, new or as kept. */
export function FrameworkSheet({
  open,
  onClose,
  framework,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  framework: FrameworkRow | null;
  onSaved: (id: string) => void | Promise<unknown>;
}) {
  const [title, setTitle] = useState(framework?.title ?? "");
  const [description, setDescription] = useState(framework?.description ?? "");
  const [assessed, setAssessed] = useState(framework?.assessed ?? true);
  const save = useMutation({
    mutationFn: () =>
      saveFramework({
        data: {
          id: framework?.id ?? "",
          expectedVersion: framework?.version ?? 0,
          title,
          description,
          assessed,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={framework ? m.standardsEditFramework() : m.standardsNewFramework()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        await save.mutateAsync().then(
          async (saved) => {
            await onSaved(saved.id);
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="framework-title"
        label={m.standardsFrameworkTitle()}
        hint={m.standardsFrameworkTitleHint()}
        maxLength={MAX_FRAMEWORK_TITLE}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <FormField
        id="framework-description"
        label={m.standardsFrameworkDescription()}
        optional
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={MAX_FRAMEWORK_DESCRIPTION}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </FormField>
      <CheckboxRow
        label={m.standardsAssessed()}
        hint={m.standardsAssessedHint()}
        checked={assessed}
        onChange={setAssessed}
      />
    </SheetForm>
  );
}

/**
 * A CASE package read from a file, checked and counted before anything is
 * sent: what CASE editors and the CASE Network export as JSON.
 */
export function ImportCaseSheet({
  open,
  onClose,
  frameworkId,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  /** The framework to update, or none to make a new one. */
  frameworkId: string;
  onImported: (id: string) => void | Promise<unknown>;
}) {
  const [found, setFound] = useState<{
    casePackage: CasePackage;
    title: string;
    items: number;
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: () => {
      if (!found) throw new Error(m.standardsCaseChoose());
      return importCase({
        data: { frameworkId, casePackage: found.casePackage },
      });
    },
    meta: { inlineError: true },
  });
  const read = async (file: File) => {
    setFound(null);
    setProblem(null);
    try {
      const parsed = v.safeParse(
        casePackageSchema,
        JSON.parse(await file.text()),
      );
      if (!parsed.success) throw new Error("not a package");
      const outline = caseOutline(parsed.output);
      setFound({
        casePackage: parsed.output,
        title: outline.title,
        items: outline.items.length,
      });
    } catch {
      setProblem(m.standardsCaseUnreadable());
    }
  };
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.standardsImportCase()}
      submitLabel={m.standardsImport()}
      pending={run.isPending}
      error={problem ?? (run.error ? getMessageFromError(run.error) : null)}
      onSubmit={async () => {
        await run.mutateAsync().then(
          async (done) => {
            toast.success(m.standardsImported({ count: done.imported }));
            await onImported(done.id);
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.standardsCaseHint()}
      </p>
      <FormField id="case-file" label={m.standardsCaseFile()}>
        {(control) => (
          <input
            {...control}
            type="file"
            accept="application/json,.json"
            className="text-sm file:me-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void read(file);
            }}
          />
        )}
      </FormField>
      {found ? (
        <p className="text-sm leading-5" dir="auto">
          {m.standardsCaseFound({
            title: found.title,
            count: found.items,
          })}
        </p>
      ) : null}
    </SheetForm>
  );
}

/** One standard's code, statement and level, and where it sits in the tree. */
export function StandardSheet({
  open,
  onClose,
  frameworkId,
  standards,
  standard,
  parentId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  frameworkId: string;
  standards: readonly StandardRow[];
  /** The standard to change, or none to add one. */
  standard: StandardRow | null;
  /** Where a new standard goes. */
  parentId: string;
  onSaved: () => void | Promise<unknown>;
}) {
  const [code, setCode] = useState(standard?.code ?? "");
  const [statement, setStatement] = useState(standard?.statement ?? "");
  const [itemType, setItemType] = useState(standard?.itemType ?? "");
  const [under, setUnder] = useState(standard?.parentId ?? parentId);
  const [search, setSearch] = useState("");
  // A standard cannot go under itself or anything beneath it.
  const below = useMemo(() => {
    const out = new Set<string>();
    if (!standard) return out;
    const visit = (id: string) => {
      out.add(id);
      for (const row of standards) if (row.parentId === id) visit(row.id);
    };
    visit(standard.id);
    return out;
  }, [standard, standards]);
  const words = search.trim().toLowerCase();
  const parents = standards
    .filter((row) => !below.has(row.id))
    .filter(
      (row) =>
        !words ||
        row.code.toLowerCase().includes(words) ||
        row.statement.toLowerCase().includes(words),
    )
    .slice(0, 50)
    .map((row) => ({ value: row.id, label: labelOf(row) }));
  const chosen = standards.find((row) => row.id === under);
  const save = useMutation({
    mutationFn: async () => {
      const saved = await saveStandard({
        data: {
          frameworkId,
          id: standard?.id ?? "",
          expectedVersion: standard?.version ?? 0,
          parentId: standard ? (standard.parentId ?? "") : under,
          code,
          statement,
          itemType,
        },
      });
      if (standard && (standard.parentId ?? "") !== under)
        await moveStandard({
          data: {
            id: standard.id,
            parentId: under,
            position: standards.filter((row) => (row.parentId ?? "") === under)
              .length,
          },
        });
      return saved;
    },
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={standard ? m.standardsEdit() : m.standardsAdd()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        await save.mutateAsync().then(
          async () => {
            await onSaved();
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="standard-code"
        label={m.standardsCode()}
        hint={m.standardsCodeHint()}
        optional
        width="name"
        maxLength={MAX_STANDARD_CODE}
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <FormField id="standard-statement" label={m.standardsStatement()}>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={MAX_STANDARD_STATEMENT}
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
          />
        )}
      </FormField>
      <TextField
        id="standard-type"
        label={m.standardsItemType()}
        hint={m.standardsItemTypeHint()}
        optional
        width="name"
        maxLength={MAX_ITEM_TYPE}
        value={itemType}
        onChange={(event) => setItemType(event.target.value)}
      />
      <ComboboxField
        label={m.standardsUnder()}
        hint={m.standardsUnderHint()}
        optional
        clearable
        options={
          chosen && !parents.some((row) => row.value === chosen.id)
            ? [{ value: chosen.id, label: labelOf(chosen) }, ...parents]
            : parents
        }
        value={under ? [under] : []}
        onChange={(next) => setUnder(next[0] ?? "")}
        search={search}
        onSearchChange={setSearch}
      />
    </SheetForm>
  );
}

/** A standard as one line names it: its code, then its statement. */
export const labelOf = (row: { code: string; statement: string }) =>
  row.code ? `${row.code} ${row.statement}` : row.statement;

/**
 * A framework as a tree of its standards, each line its code, statement and
 * level, with what a keeper of standards may do to it. Branches open and
 * close; a search shows the lines that match with the lines above them.
 */
export function StandardsTree({
  standards,
  canManage,
  onEdit,
  onAddUnder,
}: {
  standards: readonly StandardRow[];
  canManage: boolean;
  onEdit: (row: StandardRow) => void;
  onAddUnder: (parentId: string) => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["standards"] });
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, StandardRow[]>();
    for (const row of standards)
      map.set(row.parentId, [...(map.get(row.parentId) ?? []), row]);
    return map;
  }, [standards]);
  // Large frameworks open at their top level; small ones open whole.
  const [open, setOpen] = useState<ReadonlySet<string>>(() =>
    standards.length > 150
      ? new Set()
      : new Set(standards.map((row) => row.id)),
  );
  const [search, setSearch] = useState("");
  const words = search.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!words) return null;
    const keep = new Set<string>();
    const byId = new Map(standards.map((row) => [row.id, row]));
    for (const row of standards)
      if (
        row.code.toLowerCase().includes(words) ||
        row.statement.toLowerCase().includes(words)
      )
        for (
          let at: StandardRow | undefined = row;
          at;
          at = at.parentId ? byId.get(at.parentId) : undefined
        )
          keep.add(at.id);
    return keep;
  }, [standards, words]);
  const move = async (row: StandardRow, by: number) => {
    const siblings = childrenOf.get(row.parentId) ?? [];
    const index = siblings.findIndex((item) => item.id === row.id);
    await moveStandard({
      data: {
        id: row.id,
        parentId: row.parentId ?? "",
        position: Math.max(0, index + by),
      },
    });
    await refresh();
  };
  const actions = (row: StandardRow): ActionItem[] => {
    const siblings = childrenOf.get(row.parentId) ?? [];
    const index = siblings.findIndex((item) => item.id === row.id);
    return [
      { label: m.standardsEdit(), icon: Pencil, onSelect: () => onEdit(row) },
      {
        label: m.standardsAddUnder(),
        icon: Plus,
        onSelect: () => onAddUnder(row.id),
      },
      ...(index > 0
        ? [
            {
              label: m.standardsMoveUp(),
              icon: ArrowUp,
              onSelect: () => move(row, -1),
            },
          ]
        : []),
      ...(index < siblings.length - 1
        ? [
            {
              label: m.standardsMoveDown(),
              icon: ArrowDown,
              onSelect: () => move(row, 1),
            },
          ]
        : []),
      {
        label: m.standardsRemove(),
        icon: Trash2,
        destructive: true,
        confirm: {
          title: m.standardsRemoveTitle(),
          body: m.standardsRemoveBody({ standard: labelOf(row) }),
          label: m.standardsRemove(),
        },
        onSelect: async () => {
          await removeStandard({ data: { id: row.id } });
          await refresh();
        },
      },
    ];
  };
  const branch = (parent: string | null, depth: number) => (
    <ul
      className={depth === 0 ? "grid" : "grid border-s ps-4"}
      aria-label={depth === 0 ? m.standardsTreeLabel() : undefined}
    >
      {(childrenOf.get(parent) ?? [])
        .filter((row) => !shown || shown.has(row.id))
        .map((row) => {
          const children = childrenOf.get(row.id) ?? [];
          const expanded = Boolean(shown) || open.has(row.id);
          return (
            <li key={row.id} className="grid">
              <div className="group flex items-start gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50">
                {children.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-expanded={expanded}
                    aria-label={
                      expanded
                        ? m.standardsCollapse({ standard: labelOf(row) })
                        : m.standardsExpand({ standard: labelOf(row) })
                    }
                    onClick={() =>
                      setOpen((current) => {
                        const next = new Set(current);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                  >
                    <ChevronRight
                      aria-hidden
                      className={`transition-transform rtl:-scale-x-100 ${expanded ? "rotate-90 rtl:-rotate-90" : ""}`}
                    />
                  </Button>
                ) : (
                  <span aria-hidden className="size-8 shrink-0" />
                )}
                <p className="min-w-0 flex-1 pt-1 text-sm leading-5" dir="auto">
                  {row.code ? (
                    <>
                      <span className="me-1 font-mono text-[13px] font-medium text-muted-foreground">
                        {row.code}
                      </span>{" "}
                    </>
                  ) : null}
                  {row.statement}
                  {row.itemType ? (
                    <span className="ms-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {row.itemType}
                    </span>
                  ) : null}
                  {children.length > 0 && !expanded ? (
                    <span className="ms-2 text-xs text-muted-foreground tabular-nums">
                      {formatNumber(children.length)}
                    </span>
                  ) : null}
                </p>
                {canManage ? (
                  <ActionMenu
                    label={m.standardsActions({ standard: labelOf(row) })}
                    actions={actions(row)}
                  />
                ) : null}
              </div>
              {children.length > 0 && expanded
                ? branch(row.id, depth + 1)
                : null}
            </li>
          );
        })}
    </ul>
  );
  return (
    <div className="grid gap-3">
      <IndexToolbar
        search={{
          value: search,
          onChange: setSearch,
          label: m.standardsSearch(),
        }}
        onReset={() => setSearch("")}
      />
      {shown && shown.size === 0 ? (
        <FilteredEmptyState onClear={() => setSearch("")} />
      ) : (
        branch(null, 0)
      )}
    </div>
  );
}
