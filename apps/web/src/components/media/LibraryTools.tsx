import type { OpenPicture } from "@faridalms/editor/context";

import { MAX_LINK, MAX_TAG } from "@faridalms/domain/media-library";
import { EditorEnvironmentProvider } from "@faridalms/editor/context";
import { PictureSearch, pictureFile } from "@faridalms/editor/picture-search";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { TextField } from "@faridalms/ui/system/form-field";
import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { UsageList } from "@faridalms/ui/system/usage-list";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { editorStrings } from "~/components/content/strings";
import { fileSizeLabel } from "~/components/system/FileList";
import { inLocale } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { libraryStorageQuery } from "~/queries/media-library";
import {
  importLibraryLink,
  removeLibraryTag,
  renameLibraryTag,
  tagLibraryItems,
} from "~/server/media-library";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { LibraryPage, LibraryRow } from "./library-items";

import { KIND_LABEL } from "./library-items";

type LibraryTagRow = LibraryPage["facets"]["tags"][number];

/** Names typed apart by commas, as a tag field takes them. */
const namesIn = (typed: string) =>
  typed
    .split(/[,،]/u)
    .map((name) => name.trim().slice(0, MAX_TAG))
    .filter(Boolean);

export interface TagItemsSheetProps {
  items: LibraryRow[];
  onClose: () => void;
  onTagged: () => Promise<unknown>;
}

/**
 * Files items under tags, typed by name, the school's own offered as you
 * type, and takes them off the ones they carry.
 */
export function TagItemsSheet({
  items,
  onClose,
  onTagged,
}: TagItemsSheetProps) {
  const tag = useServerFn(tagLibraryItems);
  const [typed, setTyped] = useState("");
  const carried = [
    ...new Map(
      items.flatMap((item) => item.tags).map((each) => [each.id, each]),
    ).values(),
  ].toSorted((a, b) => a.name.localeCompare(b.name));
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const mutation = useMutation({
    mutationFn: () =>
      tag({
        data: {
          ids: items.map((item) => item.id),
          add: namesIn(typed),
          remove: [...removed],
        },
      }),
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        items.length === 1 && items[0]
          ? m.mediaTagTitle({ name: items[0].title || items[0].name })
          : m.mediaTagMany({
              count: items.length,
              value: formatNumber(items.length),
            })
      }
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        await mutation.mutateAsync().then(
          async () => {
            await onTagged();
            toast.success(m.mediaTagged());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="media-tags-add"
        label={m.mediaTagAdd()}
        hint={m.mediaTagAddHint()}
        dir="auto"
        autoComplete="off"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />
      {carried.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            {m.mediaTagCarried()}
          </legend>
          {carried.map((each) => (
            <label key={each.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!removed.has(each.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(removed);
                  if (checked) next.delete(each.id);
                  else next.add(each.id);
                  setRemoved(next);
                }}
              />
              <bdi>{each.name}</bdi>
            </label>
          ))}
        </fieldset>
      ) : null}
    </SheetForm>
  );
}

export interface TagsSheetProps {
  open: boolean;
  tags: LibraryTagRow[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<unknown>;
}

/** The school's tags, each renamed or taken away; taking one away keeps its items. */
export function TagsSheet({
  open,
  tags,
  onOpenChange,
  onChanged,
}: TagsSheetProps) {
  const rename = useServerFn(renameLibraryTag);
  const remove = useServerFn(removeLibraryTag);
  const [editing, setEditing] = useState<LibraryTagRow | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await work();
      await onChanged();
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <SheetPanel
        open={open && editing === null}
        onOpenChange={onOpenChange}
        title={m.mediaTags()}
        description={m.mediaTagsHint()}
      >
        {tags.length === 0 ? (
          <RecordEmpty>{m.mediaTagsNone()}</RecordEmpty>
        ) : (
          <RecordList>
            {tags.map((each) => (
              <li key={each.id} className="flex items-center gap-3 py-3">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <bdi className="truncate text-sm leading-5 font-medium">
                    {each.name}
                  </bdi>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {m.mediaTagItems({
                      count: each.count,
                      value: formatNumber(each.count),
                    })}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 max-md:size-10"
                  aria-label={m.mediaTagRenameNamed({ name: each.name })}
                  disabled={busy !== null}
                  onClick={() => {
                    setName(each.name);
                    setEditing(each);
                  }}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 max-md:size-10"
                  aria-label={m.mediaTagRemoveNamed({ name: each.name })}
                  disabled={busy !== null}
                  onClick={() =>
                    void run(each.id, () => remove({ data: { id: each.id } }))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </RecordList>
        )}
      </SheetPanel>
      {editing ? (
        <SheetForm
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          title={m.mediaTagRenameNamed({ name: editing.name })}
          pending={busy !== null}
          onSubmit={async () => {
            if (!name.trim()) return;
            await run(editing.id, () =>
              rename({ data: { id: editing.id, name } }),
            );
            setEditing(null);
          }}
        >
          <TextField
            id="media-tag-name"
            label={m.mediaTagName()}
            dir="auto"
            width="name"
            maxLength={MAX_TAG}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </SheetForm>
      ) : null}
    </>
  );
}

export interface ImportLinkSheetProps {
  folderId: string | null;
  onClose: () => void;
  onImported: () => Promise<unknown>;
}

/**
 * Brings a picture or file into the library from a link, which the server
 * fetches and checks as it checks any upload.
 */
export function ImportLinkSheet({
  folderId,
  onClose,
  onImported,
}: ImportLinkSheetProps) {
  const importLink = useServerFn(importLibraryLink);
  const [url, setUrl] = useState("");
  const mutation = useMutation({
    mutationFn: () => importLink({ data: { url: url.trim(), folderId } }),
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.mediaImportTitle()}
      submitLabel={m.mediaImport()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!url.trim()) return;
        await mutation.mutateAsync().then(
          async (imported) => {
            await onImported();
            toast.success(m.mediaImported({ name: imported.name }));
            for (const twin of imported.twins)
              toast.info(m.mediaTwin({ name: twin.twinName }));
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="media-import-link"
        label={m.mediaImportLink()}
        hint={m.mediaImportHint()}
        type="url"
        dir="ltr"
        inputMode="url"
        maxLength={MAX_LINK}
        autoComplete="off"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
    </SheetForm>
  );
}

export interface PictureSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Takes a picked picture into the library, as an upload. */
  onPick: (file: File, picture: OpenPicture) => void;
  /** Offers the device's own pictures instead. */
  onUpload: () => void;
}

/**
 * The free picture collections the editor offers a question, searched from
 * the library, and Wikimedia Commons where the school allows it: a picked
 * picture is copied into the school like any upload, a Commons one with
 * its description and the credit its licence asks for.
 */
export function PictureSearchSheet({
  open,
  onOpenChange,
  onPick,
  onUpload,
}: PictureSearchSheetProps) {
  const media = useDocumentMedia();
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={m.mediaPictureSearch()}
      description={m.mediaPictureSearchHint()}
    >
      {open ? (
        <EditorEnvironmentProvider
          value={{ strings: editorStrings(), media, locale: getLocale() }}
        >
          <PictureSearch
            credited
            onPick={async (picture) => {
              onPick(await pictureFile(picture), picture);
              onOpenChange(false);
            }}
            onUpload={() => {
              onOpenChange(false);
              onUpload();
            }}
            onClose={() => onOpenChange(false)}
          />
        </EditorEnvironmentProvider>
      ) : null}
    </SheetPanel>
  );
}

export interface StorageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Where the school's storage goes: the pool and how full it is, by kind of
 * file and by the staff who uploaded the most, with students and families
 * counted together.
 */
export function StorageSheet({ open, onOpenChange }: StorageSheetProps) {
  const storage = useQuery({ ...libraryStorageQuery, enabled: open }).data;
  const limit = storage?.limitBytes ?? 0;
  const row = (id: string, label: string, usedBytes: number) => ({
    id,
    label,
    used: fileSizeLabel(usedBytes),
    allowed: m.mediaStorageOf({ limit: fileSizeLabel(limit) }),
    share: limit > 0 ? usedBytes / limit : null,
  });
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={m.mediaStorage()}
      description={m.mediaStorageHint()}
    >
      {storage ? (
        <div className="grid gap-6">
          <UsageList
            label={m.mediaStorageTotal()}
            items={[row("total", m.mediaStorageTotal(), storage.usedBytes)]}
          />
          <UsageList
            label={m.mediaStorageByKind()}
            titled
            items={storage.kinds.map((kind) =>
              row(kind.kind, KIND_LABEL[kind.kind](), kind.usedBytes),
            )}
          />
          <UsageList
            label={m.mediaStorageByPerson()}
            titled
            items={[
              ...storage.staff.map((person) =>
                row(
                  person.id,
                  inLocale(person.fullNameEn, person.fullNameAr) ||
                    m.commonNotRecorded(),
                  person.usedBytes,
                ),
              ),
              ...(storage.others.fileCount > 0
                ? [
                    row(
                      "others",
                      m.mediaStorageOthers(),
                      storage.others.usedBytes,
                    ),
                  ]
                : []),
            ]}
          />
        </div>
      ) : (
        <div aria-busy="true" className="min-h-24" />
      )}
    </SheetPanel>
  );
}
