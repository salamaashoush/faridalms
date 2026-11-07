import type { PictureCredit } from "@faridalms/domain/commons";

import {
  MAX_DESCRIPTION,
  MAX_FOLDER_NAME,
} from "@faridalms/domain/media-library";
import { FileIcon } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { libraryQuery, libraryUsesQuery } from "~/queries/media-library";
import {
  createLibraryFolder,
  describeLibraryItem,
  moveLibraryItems,
  renameLibraryFolder,
  trashLibraryItem,
} from "~/server/media-library";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { LibraryFolderRow, LibraryRow } from "./library-items";

import { hostKindLabel } from "./library-items";

const TRASH_DAYS = 30;

export interface DescribeSheetProps {
  item: LibraryRow;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}

/**
 * An item's name and what it says of itself: the description every use
 * starts from, which a use may say otherwise, and who made it.
 */
export function DescribeSheet({ item, onClose, onSaved }: DescribeSheetProps) {
  const describe = useServerFn(describeLibraryItem);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [author, setAuthor] = useState(item.credit?.author ?? "");
  const [licence, setLicence] = useState(item.credit?.licence ?? "");
  const credit: PictureCredit | null =
    author.trim() || licence.trim()
      ? {
          ...item.credit,
          author: author.trim(),
          licence: licence.trim(),
        }
      : null;
  const mutation = useMutation({
    mutationFn: () =>
      describe({ data: { id: item.id, name, description, credit } }),
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.mediaDescribeTitle({ name: item.name })}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!name.trim()) return;
        await mutation.mutateAsync().then(
          async () => {
            await onSaved();
            toast.success(m.mediaDescribed());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="media-item-name"
        label={m.filesColumnName()}
        dir="auto"
        maxLength={255}
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <FormField
        id="media-item-description"
        label={m.mediaDescription()}
        optional
        hint={m.mediaDescriptionHint()}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={MAX_DESCRIPTION}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </FormField>
      <TextField
        id="media-item-author"
        label={m.mediaCreditAuthor()}
        optional
        dir="auto"
        maxLength={300}
        autoComplete="off"
        value={author}
        onChange={(event) => setAuthor(event.target.value)}
      />
      <TextField
        id="media-item-licence"
        label={m.mediaCreditLicence()}
        optional
        dir="auto"
        maxLength={120}
        autoComplete="off"
        value={licence}
        onChange={(event) => setLicence(event.target.value)}
      />
    </SheetForm>
  );
}

/** A folder and the folders above it, as a move offers it. */
function folderLabel(folders: LibraryFolderRow[], folder: LibraryFolderRow) {
  const names = [folder.name];
  let parent = folders.find((row) => row.id === folder.parentId);
  while (parent && names.length < folders.length) {
    names.unshift(parent.name);
    const above = parent.parentId;
    parent = folders.find((row) => row.id === above);
  }
  return names.join(" / ");
}

export interface MoveSheetProps {
  items: LibraryRow[];
  folders: LibraryFolderRow[];
  onClose: () => void;
  onMoved: () => Promise<unknown>;
}

/** Files items in another folder, or at the top of the library. */
export function MoveSheet({
  items,
  folders,
  onClose,
  onMoved,
}: MoveSheetProps) {
  const move = useServerFn(moveLibraryItems);
  const [target, setTarget] = useState(items[0]?.folderId ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      move({
        data: { ids: items.map((item) => item.id), folderId: target || null },
      }),
  });
  const options = [
    { value: "", label: m.mediaTop() },
    ...folders
      .map((folder) => ({
        value: folder.id,
        label: folderLabel(folders, folder),
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label)),
  ];
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        items.length === 1 && items[0]
          ? m.mediaMoveTitle({ name: items[0].name })
          : m.mediaMoveMany()
      }
      submitLabel={m.mediaMove()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        await mutation.mutateAsync().then(
          async () => {
            await onMoved();
            toast.success(m.mediaMoved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="media-move-folder"
        label={m.mediaFolder()}
        value={target}
        options={options}
        onChange={setTarget}
      />
    </SheetForm>
  );
}

export interface FolderSheetProps {
  /** The folder renamed, or none to make a new one in `parentId`. */
  folder: LibraryFolderRow | null;
  parentId: string | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}

/** Makes a folder in the open one, or renames one. */
export function FolderSheet({
  folder,
  parentId,
  onClose,
  onSaved,
}: FolderSheetProps) {
  const create = useServerFn(createLibraryFolder);
  const rename = useServerFn(renameLibraryFolder);
  const [name, setName] = useState(folder?.name ?? "");
  const mutation = useMutation({
    mutationFn: async () => {
      if (folder) await rename({ data: { id: folder.id, name } });
      else await create({ data: { name, parentId } });
    },
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        folder
          ? m.mediaFolderRenameTitle({ name: folder.name })
          : m.mediaFolderNew()
      }
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!name.trim()) return;
        await mutation.mutateAsync().then(
          async () => {
            await onSaved();
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="media-folder-name"
        label={m.mediaFolderName()}
        dir="auto"
        width="name"
        maxLength={MAX_FOLDER_NAME}
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
    </SheetForm>
  );
}

export interface UsesSheetProps {
  item: LibraryRow | null;
  onOpenChange: (open: boolean) => void;
}

/** The documents showing an item, so a change is made knowing what it reaches. */
export function UsesSheet({ item, onOpenChange }: UsesSheetProps) {
  const uses = useQuery({
    ...libraryUsesQuery(item?.id ?? ""),
    enabled: item !== null,
  });
  const rows = uses.data?.uses ?? [];
  return (
    <SheetPanel
      open={item !== null}
      onOpenChange={onOpenChange}
      title={item ? m.mediaUsesTitle({ name: item.name }) : m.mediaUses()}
      description={m.mediaUsesHint()}
    >
      {uses.isPending ? (
        <div aria-busy="true" className="min-h-24" />
      ) : rows.length === 0 ? (
        <RecordEmpty>{m.mediaUsedNowhere()}</RecordEmpty>
      ) : (
        <RecordList>
          {rows.map((use) => (
            <li
              key={`${use.hostType}-${use.hostId}`}
              className="grid gap-0.5 py-3"
            >
              <bdi className="text-sm leading-5 font-medium">
                {inLocale(use.titleEn, use.titleAr) || m.mediaUntitled()}
              </bdi>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {hostKindLabel(use.hostType)}
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </SheetPanel>
  );
}

export interface TrashSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => Promise<unknown>;
}

/** What waits in the library's trash, each restorable until 30 days have passed. */
export function TrashSheet({
  open,
  onOpenChange,
  onRestored,
}: TrashSheetProps) {
  const trashed = useQuery({
    ...libraryQuery({ trashed: true }),
    enabled: open,
  });
  const restore = useServerFn(trashLibraryItem);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = trashed.data?.items.rows ?? [];
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={m.filesTrash()}
      description={m.mediaTrashHint()}
    >
      {trashed.isPending ? (
        <div aria-busy="true" className="min-h-24" />
      ) : rows.length === 0 ? (
        <RecordEmpty>{m.filesTrashEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {rows.map((item) => {
            const deleted = item.trashedAt ?? item.createdAt;
            const until = new Date(
              new Date(deleted).getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000,
            ).toISOString();
            return (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <FileIcon
                  file={{ name: item.name, mime: item.mediaType }}
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <bdi className="truncate text-sm leading-5 font-medium">
                    {item.name}
                  </bdi>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {m.filesTrashFact({
                      date: formatDate(deleted),
                      until: formatDate(until),
                    })}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="max-md:h-10"
                  disabled={busy !== null}
                  aria-label={m.filesRestoreNamed({ name: item.name })}
                  onClick={async () => {
                    setBusy(item.id);
                    try {
                      await restore({ data: { id: item.id, trashed: false } });
                      await Promise.all([trashed.refetch(), onRestored()]);
                      toast.success(m.filesRestored());
                    } catch (error) {
                      toast.error(getMessageFromError(error));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <RotateCcw aria-hidden />
                  {m.filesRestore()}
                </Button>
              </li>
            );
          })}
        </RecordList>
      )}
    </SheetPanel>
  );
}
