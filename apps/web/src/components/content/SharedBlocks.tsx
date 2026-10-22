import type { ContentDocument } from "@faridalms/domain/content";
import type { SharedScope } from "@faridalms/domain/shared";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Search, Trash2 } from "lucide-react";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { sharedBlockQuery } from "~/queries/shared";
import { listShared, removeShared, saveShared } from "~/server/shared";
import { getMessageFromError } from "~/utils/error";

import { ContentEditor } from "./ContentEditor";
import { ContentView, SharedBlock } from "./ContentView";

/** Who may use a shared block: only its teacher, or any at the school. */
function ScopeField({
  scope,
  onChange,
}: {
  scope: SharedScope;
  onChange: (scope: SharedScope) => void;
}) {
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
                {value === "mine" ? m.sharedKeepMine() : m.sharedKeepSchool()}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {value === "mine" ? m.sharedMineHint() : m.sharedSchoolHint()}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function KeepDialog({
  content,
  onClose,
}: {
  content: ContentDocument;
  onClose: (id: string | null) => void;
}) {
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

type Row = Awaited<ReturnType<typeof listShared>>[number];

/** One shared block: its name and whose it is, and how it reads on request. */
function SharedRow({ row, onShow }: { row: Row; onShow: () => void }) {
  const queryClient = useQueryClient();
  const [looking, setLooking] = useState(false);
  const remove = useMutation({
    mutationFn: () => removeShared({ data: { id: row.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shared"] });
      toast.success(m.sharedRemoved());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
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
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
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
    </li>
  );
}

function ChooseSheet({ onChoose }: { onChoose: (id: string | null) => void }) {
  const [search, setSearch] = useState("");
  const words = useDeferredValue(search.trim());
  const listed = useQuery({
    queryKey: ["shared", "list", words],
    queryFn: () => listShared({ data: { search: words, scope: "all" } }),
  });
  const rows = listed.data ?? [];
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
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Changes a shared block where it is kept, so every document showing it
 * shows the change. Only the teacher who kept it may.
 */
function EditDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const block = useQuery(sharedBlockQuery(id));
  const media = useDocumentMedia();
  const titleId = useId();
  const [draft, setDraft] = useState<{
    title: string;
    content: ContentDocument;
  } | null>(null);
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
          <DialogTitle className="text-base font-semibold">
            {m.sharedEditTitle()}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {loaded && !loaded.editable
              ? m.sharedNotYours()
              : m.sharedEditBody()}
          </DialogDescription>
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
