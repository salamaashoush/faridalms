import type { ContentDocument } from "@faridalms/domain/content";
import type { Keyset } from "@faridalms/domain/paging";
import type { SharedKind, SharedScope } from "@faridalms/domain/shared";
import type { EditorShared } from "@faridalms/editor";
import type { ReactNode } from "react";

import { contentPlainText } from "@faridalms/domain/content";
import { MAX_SHARED_TITLE } from "@faridalms/domain/shared";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { Input } from "@faridalms/ui/input";
import { Label } from "@faridalms/ui/label";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronRight,
  History,
  LoaderCircle,
  Search,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { sharedBlockQuery } from "~/queries/shared";
import {
  listShared,
  removeShared,
  saveShared,
  sharedUses,
} from "~/server/shared";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { ContentEditor } from "./ContentEditor";
import { ContentView, SharedBlock } from "./ContentView";
import { DocumentHistory } from "./DocumentHistory";

export interface ScopeFieldProps {
  scope: SharedScope;
  onChange: (scope: SharedScope) => void;
  /** A website section is shared among those who manage the website, not teachers. */
  kind?: SharedKind;
}

const SCOPE_WORDS: Record<
  SharedKind,
  Record<SharedScope, { name: () => string; hint: () => string }>
> = {
  block: {
    mine: { name: m.sharedKeepMine, hint: m.sharedMineHint },
    school: { name: m.sharedKeepSchool, hint: m.sharedSchoolHint },
  },
  section: {
    mine: { name: m.sharedKeepMine, hint: m.sharedSectionMineHint },
    school: {
      name: m.sharedSectionKeepSchool,
      hint: m.sharedSectionSchoolHint,
    },
  },
};

/** Who may use a shared block or section: only whoever kept it, or anyone who writes that kind of thing. */
export function ScopeField({
  scope,
  onChange,
  kind = "block",
}: ScopeFieldProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{m.sharedKeepIn()}</legend>
      <RadioGroup
        value={scope}
        onValueChange={(value) => onChange(value as SharedScope)}
        className="gap-2.5"
      >
        {(["mine", "school"] as const).map((value) => (
          <Label key={value} className="flex items-start gap-3 font-normal">
            <RadioGroupItem value={value} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">
                {SCOPE_WORDS[kind][value].name()}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {SCOPE_WORDS[kind][value].hint()}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

interface KeepDialogProps {
  content: ContentDocument;
  onClose: (id: string | null) => void;
}

function KeepDialog({ content, onClose }: KeepDialogProps) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const [title, setTitle] = useState(() =>
    contentPlainText(content).replaceAll(/\s+/gu, " ").trim().slice(0, 60),
  );
  const [scope, setScope] = useState<SharedScope>("mine");
  const keep = useMutation({
    mutationFn: () =>
      saveShared({
        data: { id: "", expectedVersion: 0, title, scope, content },
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["shared"] });
      toast.success(m.sharedKept());
      onClose(saved.id);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !keep.isPending) onClose(null);
      }}
    >
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-lg">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            keep.mutate();
          }}
        >
          <div className="grid gap-2">
            <DialogTitle className="text-base font-semibold">
              {m.sharedKeepTitle()}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {m.sharedKeepBody()}
            </DialogDescription>
          </div>
          <div className="max-h-60 overflow-y-auto rounded-md border p-3">
            <ContentView document={content} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={titleId}>{m.sharedTitle()}</Label>
            <Input
              id={titleId}
              dir="auto"
              required
              value={title}
              maxLength={MAX_SHARED_TITLE}
              onChange={(event) => setTitle(event.target.value)}
              className="max-md:h-10"
            />
          </div>
          <ScopeField scope={scope} onChange={setScope} />
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={keep.isPending}
              onClick={() => onClose(null)}
            >
              {m.docCancel()}
            </Button>
            <Button type="submit" disabled={keep.isPending || !title.trim()}>
              {keep.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : null}
              {m.sharedKeepAction()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Row = Awaited<ReturnType<typeof listShared>>["rows"][number];
type Use = Awaited<ReturnType<typeof sharedUses>>[number];

const usesQuery = (id: string) => ({
  queryKey: ["shared", "uses", id],
  queryFn: () => sharedUses({ data: { id } }),
});

const USE_KIND: Record<Use["hostType"], () => string> = {
  lesson: m.libraryKindLesson,
  assignment: m.libraryKindAssignment,
  module_plan: m.libraryKindPlan,
  announcement: m.libraryKindAnnouncement,
  news: m.libraryKindNews,
  site_page: m.sharedUsePage,
};

const WEBSITE = new Set<Use["hostType"]>(["site_page", "news"]);

export interface SharedUsesProps {
  id: string;
  /** A shared section's changes reach published pages at once, a block's at their next publication. */
  kind?: SharedKind;
}

/** Which documents show a shared block, or pages a shared section, named on request, so a change is made knowing what it reaches. */
export function SharedUses({ id, kind = "block" }: SharedUsesProps) {
  const uses = useQuery(usesQuery(id));
  const [open, setOpen] = useState(false);
  const rows = uses.data ?? [];
  if (uses.isPending) return <div aria-busy="true" className="h-5" />;
  if (rows.length === 0)
    return (
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {kind === "section"
          ? m.sharedSectionUsedNowhere()
          : m.sharedUsedNowhere()}
      </p>
    );
  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex w-fit items-center gap-1 rounded-md text-[13px] leading-[18px] font-medium text-foreground/80 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3.5"
      >
        <ChevronRight
          aria-hidden
          className={open ? "rotate-90" : "rtl:-scale-x-100"}
        />
        {m.sharedUsedIn({
          count: rows.length,
          value: formatNumber(rows.length),
        })}
      </button>
      {open && rows.some((row) => WEBSITE.has(row.hostType)) ? (
        <p className="ps-[18px] text-[13px] leading-[18px] text-muted-foreground">
          {kind === "section"
            ? m.sharedSectionUsesWebsite()
            : m.sharedUsesWebsite()}
        </p>
      ) : null}
      {open ? (
        <ul className="grid max-h-40 gap-1 overflow-y-auto ps-[18px] text-[13px] leading-[18px]">
          {rows.map((row) => (
            <li key={`${row.hostType}-${row.hostId}`} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">
                {USE_KIND[row.hostType]()}
              </span>
              <span className="min-w-0 truncate">
                <bdi>{inLocale(row.titleEn, row.titleAr)}</bdi>
                {row.placeEn ? (
                  <span className="text-muted-foreground">
                    {" · "}
                    <bdi>{inLocale(row.placeEn, row.placeAr)}</bdi>
                  </span>
                ) : null}
                {kind === "section" && row.live ? (
                  <span className="text-muted-foreground">
                    {" · "}
                    {m.sharedSectionLive()}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface SharedRowProps {
  row: Row;
  onShow: () => void;
}

/** One shared block: its name and whose it is, and how it reads on request. */
function SharedRow({ row, onShow }: SharedRowProps) {
  const queryClient = useQueryClient();
  const [looking, setLooking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const uses = useQuery({ ...usesQuery(row.id), enabled: removing });
  const remove = useMutation({
    mutationFn: () => removeShared({ data: { id: row.id } }),
    onSuccess: async () => {
      setRemoving(false);
      await queryClient.invalidateQueries({ queryKey: ["shared"] });
      toast.success(m.sharedRemoved());
    },
  });
  const shown = uses.data?.length ?? 0;
  const owner = inLocale(row.ownerNameEn, row.ownerNameAr);
  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          aria-expanded={looking}
          className="grid min-w-0 flex-1 gap-1 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => setLooking(!looking)}
        >
          <span dir="auto" className="text-sm leading-5 font-medium">
            {row.title}
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {[
              row.scope === "school"
                ? m.sharedScopeSchool()
                : m.sharedScopeMine(),
              row.mine ? null : owner,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {row.mine ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.sharedRemove()}
              onClick={() => setRemoving(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={onShow}>
            {m.sharedShow()}
          </Button>
        </div>
      </div>
      {looking ? (
        <div className="rounded-md border p-3">
          <SharedBlock id={row.id} />
        </div>
      ) : null}
      <ConfirmDialog
        open={removing}
        title={m.sharedRemoveTitle({ title: row.title })}
        body={
          uses.isPending
            ? ""
            : shown > 0
              ? m.sharedRemoveBody({
                  count: shown,
                  value: formatNumber(shown),
                })
              : m.sharedUsedNowhere()
        }
        confirmLabel={m.sharedRemove()}
        pending={remove.isPending || uses.isPending}
        error={remove.error ? getMessageFromError(remove.error) : undefined}
        onConfirm={() => remove.mutate()}
        onCancel={() => {
          setRemoving(false);
          remove.reset();
        }}
      />
    </li>
  );
}

interface ChooseSheetProps {
  onChoose: (id: string | null) => void;
}

function ChooseSheet({ onChoose }: ChooseSheetProps) {
  const [search, setSearch] = useState("");
  const words = useDeferredValue(search.trim());
  const listed = useInfiniteQuery({
    queryKey: ["shared", "list", words],
    queryFn: ({ pageParam }) =>
      listShared({ data: { search: words, scope: "all", after: pageParam } }),
    initialPageParam: null as Keyset | null,
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const rows = listed.data?.pages.flatMap((page) => page.rows) ?? [];
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onChoose(null);
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="gap-1 border-b px-5 py-4">
          <SheetTitle>{m.sharedChooseTitle()}</SheetTitle>
          <SheetDescription>{m.sharedChooseBody()}</SheetDescription>
        </SheetHeader>
        <div className="border-b px-5 py-3">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              dir="auto"
              value={search}
              aria-label={m.sharedSearch()}
              placeholder={m.sharedSearch()}
              onChange={(event) => setSearch(event.target.value)}
              className="ps-8 max-md:h-10"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {listed.isPending ? (
            <div aria-busy="true" className="min-h-24" />
          ) : rows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {words ? m.sharedNoneFound() : m.sharedNone()}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <SharedRow
                  key={row.id}
                  row={row}
                  onShow={() => onChoose(row.id)}
                />
              ))}
            </ul>
          )}
          {listed.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="my-3 max-md:h-10"
              disabled={listed.isFetchingNextPage}
              onClick={() => void listed.fetchNextPage()}
            >
              {m.sharedShowMore()}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface EditDialogProps {
  id: string;
  onClose: () => void;
}

/**
 * Changes a shared block where it is kept, so every document showing it
 * shows the change. Only the teacher who kept it may.
 */
function EditDialog({ id, onClose }: EditDialogProps) {
  const queryClient = useQueryClient();
  const block = useQuery(sharedBlockQuery(id));
  const media = useDocumentMedia();
  const titleId = useId();
  const [draft, setDraft] = useState<{
    title: string;
    content: ContentDocument;
  } | null>(null);
  const [history, setHistory] = useState(false);
  const [replace, setReplace] = useState<{
    to: ContentDocument;
    at: number;
  }>();
  const loaded = block.data;
  const current =
    draft ?? (loaded ? { title: loaded.title, content: loaded.content } : null);
  const save = useMutation({
    mutationFn: () => {
      if (!loaded || !current) throw new Error("shared.not_found");
      return saveShared({
        data: {
          id: loaded.id,
          expectedVersion: loaded.version,
          title: current.title,
          scope: loaded.scope,
          content: current.content,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shared"] });
      toast.success(m.sharedSaved());
      onClose();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-3xl">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 pe-8">
            <DialogTitle className="text-base font-semibold">
              {m.sharedEditTitle()}
            </DialogTitle>
            {loaded?.editable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setHistory(true)}
              >
                <History aria-hidden />
                {m.docHistory()}
              </Button>
            ) : null}
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            {loaded && !loaded.editable
              ? m.sharedNotYours()
              : m.sharedEditBody()}
          </DialogDescription>
          {loaded?.editable ? <SharedUses id={id} /> : null}
        </div>
        {!current ? (
          <div aria-busy="true" className="min-h-40" />
        ) : loaded?.editable ? (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={titleId}>{m.sharedTitle()}</Label>
              <Input
                id={titleId}
                dir="auto"
                required
                value={current.title}
                maxLength={MAX_SHARED_TITLE}
                onChange={(event) =>
                  setDraft({ ...current, title: event.target.value })
                }
                className="max-md:h-10"
              />
            </div>
            <ContentEditor
              id={`shared-${id}`}
              label={current.title}
              value={current.content}
              media={media}
              replace={replace}
              onChange={(content) => setDraft({ ...current, content })}
            />
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={onClose}
              >
                {m.docCancel()}
              </Button>
              <Button
                type="submit"
                disabled={save.isPending || !current.title.trim()}
              >
                {save.isPending ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : null}
                {m.sharedSave()}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="rounded-md border p-3">
            <ContentView document={current.content} />
          </div>
        )}
        {loaded?.editable ? (
          <DocumentHistory
            open={history}
            onOpenChange={setHistory}
            hostType="shared_block"
            hostId={id}
            onRestore={(restored) => {
              if (restored.kind !== "document") return;
              const to = restored.content;
              setDraft((before) =>
                before
                  ? { ...before, content: to }
                  : { title: loaded.title, content: to },
              );
              setReplace((before) => ({ to, at: (before?.at ?? 0) + 1 }));
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shared blocks for an editor: keeping one from a block, choosing one to
 * show, changing one wherever it shows, and reading one to copy.
 */
export function useEditorShared(enabled: boolean): {
  shared: EditorShared | undefined;
  dialog: ReactNode;
} {
  const queryClient = useQueryClient();
  const [keeping, setKeeping] = useState<{
    content: ContentDocument;
    done: (id: string | null) => void;
  } | null>(null);
  const [choosing, setChoosing] = useState<
    ((id: string | null) => void) | null
  >(null);
  const [editing, setEditing] = useState<string | null>(null);
  const shared = useMemo<EditorShared | undefined>(
    () =>
      enabled
        ? {
            View: SharedBlock,
            keep: (content) =>
              new Promise((resolve) => setKeeping({ content, done: resolve })),
            choose: () =>
              new Promise((resolve) => {
                setChoosing(() => resolve);
              }),
            edit: (id) => setEditing(id),
            read: async (id) =>
              (await queryClient.fetchQuery(sharedBlockQuery(id))).content,
          }
        : undefined,
    [enabled, queryClient],
  );
  return {
    shared,
    dialog: (
      <>
        {keeping ? (
          <KeepDialog
            content={keeping.content}
            onClose={(id) => {
              keeping.done(id);
              setKeeping(null);
            }}
          />
        ) : null}
        {choosing ? (
          <ChooseSheet
            onChoose={(id) => {
              choosing(id);
              setChoosing(null);
            }}
          />
        ) : null}
        {editing ? (
          <EditDialog id={editing} onClose={() => setEditing(null)} />
        ) : null}
      </>
    ),
  };
}
