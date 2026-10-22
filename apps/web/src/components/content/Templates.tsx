import type { ContentDocument } from "@faridalms/domain/content";
import type { TemplateKind } from "@faridalms/domain/templates";
import type { EditorMedia } from "@faridalms/editor";

import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { libraryPictureUrls } from "@faridalms/domain/library";
import { pictureFile } from "@faridalms/editor/picture-library";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@faridalms/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@faridalms/ui/dropdown-menu";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  GraduationCap,
  LayoutTemplate,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { Starter } from "~/components/learning/starters";

import { BookError, importPictureBook } from "~/components/learning/bookImport";
import { altIn, sayIn, STARTERS } from "~/components/learning/starters";
import { labelOf } from "~/components/people/format";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { inLocale, useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { subjectsQuery } from "~/queries/classes";
import {
  listTemplates,
  openTemplate,
  removeTemplate,
  saveTemplate,
} from "~/server/templates";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

const BOOK_ERROR: Record<string, () => string> = {
  "book.unreadable": m.starterBookUnreadable,
  "book.empty": m.starterBookEmpty,
  "book.too_long": m.starterBookTooLong,
};

/** A shape the product offers to start a document from. */
export interface BuiltInPiece {
  key: string;
  title: string;
  hint: string;
  /** The document it starts; null when it cannot be made. */
  content: () => ContentDocument | null;
}

export interface BuiltInGroup {
  label: string;
  items: BuiltInPiece[];
}

const templatesQuery = (kind: TemplateKind) => ({
  queryKey: ["templates", kind],
  queryFn: () => listTemplates({ data: { kind } }),
});

/**
 * Offered on an empty document: the templates the school keeps for this
 * kind, any of which fills the page to start from.
 */
export function TemplatePicker({
  kind,
  onApply,
  starters,
  builtIn,
}: {
  kind: TemplateKind;
  /** Fills the page; a shape the product offers comes with it. */
  onApply: (content: ContentDocument, shape?: BuiltInPiece) => void;
  /** Ready-made young activities, whose pictures are stored through this. */
  starters?: EditorMedia;
  /** Shapes the product offers for this kind, ahead of the school's own. */
  builtIn?: BuiltInGroup;
}) {
  const queryClient = useQueryClient();
  const rows = useQuery(templatesQuery(kind)).data ?? [];
  const apply = useMutation({
    mutationFn: (id: string) => openTemplate({ data: { id } }),
    onSuccess: (result) => onApply(result.content),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeTemplate({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["templates", kind] });
      toast.success(m.tplRemoved());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const start = useMutation({
    mutationFn: async (starter: Starter) => {
      if (!starters) throw new Error("file.failed");
      const locale = getLocale() === "ar" ? "ar" : "en";
      // Each picture is copied into the school, as one picked by hand is.
      const pictures = await Promise.all(
        starter.pictures.map(async (picture) => {
          const alt = altIn(locale, picture);
          const file = await pictureFile({
            source: picture.source,
            id: picture.id,
            label: alt,
            ...libraryPictureUrls(picture.source, picture.id),
          });
          const stored = await starters.upload(file, "image");
          return { fileId: stored.fileId, alt };
        }),
      );
      const content = contentOfLesson({
        version: 2,
        blocks: starter.blocks(sayIn(locale), (index) => {
          const picture = pictures[index];
          if (!picture) throw new Error("file.failed");
          return picture;
        }),
      });
      if (!content) throw new Error("content.invalid");
      return content;
    },
    onSuccess: (content) => onApply(content),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const book = useMutation({
    mutationFn: async (file: File) => {
      if (!starters) throw new Error("file.failed");
      const progress = toast.loading(m.starterBookReading());
      try {
        const imported = await importPictureBook(
          file,
          async (picture) => (await starters.upload(picture, "image")).fileId,
          (done, total) =>
            toast.loading(
              m.starterBookProgress({
                done: formatNumber(done),
                total: formatNumber(total),
              }),
              { id: progress },
            ),
        );
        return imported.content;
      } finally {
        toast.dismiss(progress);
      }
    },
    onSuccess: (content) => onApply(content),
    onError: (error) =>
      toast.error(
        error instanceof BookError
          ? (BOOK_ERROR[error.message] ?? m.starterBookUnreadable)()
          : getMessageFromError(error),
      ),
  });
  const chooseBook = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".epub,application/epub+zip";
    // Attached while open: Safari on iOS opens no chooser for a detached input.
    input.hidden = true;
    input.addEventListener("change", () => {
      const [file] = input.files ?? [];
      input.remove();
      if (file) book.mutate(file);
    });
    input.addEventListener("cancel", () => input.remove());
    document.body.append(input);
    input.click();
  };
  if (rows.length === 0 && !starters && !builtIn) return null;
  const mine = rows.filter((row) => row.mine);
  const busy = apply.isPending || start.isPending || book.isPending;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit max-md:h-10"
            disabled={busy}
          />
        }
      >
        {busy ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <LayoutTemplate aria-hidden />
        )}
        {m.tplStartFrom()}
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        {builtIn ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{builtIn.label}</DropdownMenuLabel>
              {builtIn.items.map((item) => (
                <DropdownMenuItem
                  key={item.key}
                  onClick={() => {
                    const content = item.content();
                    if (content) onApply(content, item);
                    else
                      toast.error(
                        getMessageFromError(new Error("content.invalid")),
                      );
                  }}
                  className="items-start"
                >
                  <GraduationCap aria-hidden className="mt-0.5" />
                  <span className="grid gap-0.5">
                    <span>{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.hint}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {starters || rows.length > 0 ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {starters ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.starterGroup()}</DropdownMenuLabel>
              {STARTERS.map((starter) => (
                <DropdownMenuItem
                  key={starter.key}
                  onClick={() => start.mutate(starter)}
                >
                  <Sparkles aria-hidden />
                  <span className="truncate">{starter.title()}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={chooseBook} className="items-start">
                <BookOpen aria-hidden className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span>{m.starterBook()}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.starterBookHint()}
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {rows.length > 0 ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        <DropdownMenuGroup>
          {rows.map((row) => (
            <DropdownMenuItem
              key={row.id}
              onClick={() => apply.mutate(row.id)}
              className="grid gap-0.5"
            >
              <span dir="auto" className="truncate font-medium">
                {row.title}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {row.mine
                  ? row.state === "pending"
                    ? `${m.tplYours()} · ${m.tplPending()}`
                    : row.state === "declined"
                      ? `${m.tplYours()} · ${m.tplDeclined()}`
                      : m.tplYours()
                  : inLocale(row.ownerNameEn, row.ownerNameAr)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {mine.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.tplRemoveYours()}</DropdownMenuLabel>
              {mine.map((row) => (
                <DropdownMenuItem
                  key={row.id}
                  variant="destructive"
                  onClick={() => remove.mutate(row.id)}
                >
                  <span dir="auto" className="truncate">
                    {row.title}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A library piece a new document starts from. */
export interface StartingPiece {
  title: string;
  content: ContentDocument;
}

/**
 * Applies the library piece a new document was opened from, once, after its
 * editor is drawn, so the first save stores it as any other edit would.
 */
export function useStartFrom(
  piece: StartingPiece | undefined,
  apply: (piece: StartingPiece) => void,
) {
  const applied = useRef(false);
  useEffect(() => {
    if (!piece || applied.current) return;
    applied.current = true;
    apply(piece);
  }, [piece, apply]);
}

/** Keeps the document as a template the whole school can start from. */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  kind,
  content,
  suggestedTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: TemplateKind;
  content: ContentDocument;
  suggestedTitle: string;
}) {
  const queryClient = useQueryClient();
  const reviews = useCapability("library:review");
  const subjects = useQuery(subjectsQuery).data?.rows ?? [];
  const [title, setTitle] = useState(suggestedTitle);
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const save = useMutation({
    mutationFn: () =>
      saveTemplate({
        data: {
          kind,
          title: title.trim(),
          description: description.trim(),
          subjectId,
          content,
        },
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(
        saved.state === "shared" ? m.tplSaved() : m.tplSentForReview(),
      );
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!save.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) save.mutate();
          }}
        >
          <div className="grid gap-2">
            <DialogTitle className="text-base font-semibold">
              {m.tplSaveTitle()}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {reviews ? m.tplSaveBodyReviewer() : m.tplSaveBody()}
            </DialogDescription>
          </div>
          <TextField
            id="template-title"
            label={m.tplName()}
            dir="auto"
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            errors={save.error ? [getMessageFromError(save.error)] : undefined}
          />
          <FormField
            id="template-description"
            label={m.tplDescription()}
            optional
          >
            {(control) => (
              <Textarea
                {...control}
                dir="auto"
                rows={3}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </FormField>
          {subjects.length > 0 ? (
            <SelectField
              id="template-subject"
              label={m.tplSubject()}
              optional
              value={subjectId}
              options={[
                { value: "", label: m.tplNoSubject() },
                ...subjects.map((row) => ({
                  value: row.id,
                  label: labelOf(row) ?? row.code,
                })),
              ]}
              onChange={setSubjectId}
            />
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
            >
              {m.docCancel()}
            </Button>
            <Button type="submit" disabled={save.isPending || !title.trim()}>
              {save.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : null}
              {m.tplSave()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
