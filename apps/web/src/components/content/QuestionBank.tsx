import type { BankScope } from "@faridalms/domain/bank";
import type { ContentDocument, QuestionKind } from "@faridalms/domain/content";
import type { EditorBank } from "@faridalms/editor";
import type { ReactNode } from "react";

import { MAX_BANK_TAG, MAX_BANK_TAGS } from "@faridalms/domain/bank";
import { TextWithMath } from "@faridalms/editor/math";
import { Badge } from "@faridalms/ui/badge";
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
import { LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { ContentView } from "~/components/content/ContentView";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import {
  bankTags,
  listBank,
  openBankQuestion,
  removeBankQuestion,
  saveBankQuestion,
} from "~/server/bank";
import { getMessageFromError } from "~/utils/error";

const KIND_LABEL: Record<QuestionKind, () => string> = {
  choice: m.editorQuestionChoice,
  poll: m.editorQuestionPoll,
  labelling: m.editorQuestionLabelling,
  text: m.editorQuestionTyped,
  math: m.editorQuestionMath,
  written: m.editorQuestionWritten,
  number: m.editorQuestionNumber,
  ordering: m.editorQuestionOrdering,
  matching: m.editorQuestionMatching,
  sorting: m.editorQuestionSorting,
  gaps: m.editorQuestionGaps,
  highlight: m.editorQuestionHighlight,
  counting: m.editorQuestionCounting,
  tracing: m.editorQuestionTracing,
  spelling: m.editorQuestionSpelling,
  hotspot: m.editorQuestionHotspot,
  scratch: m.editorQuestionScratch,
  project: m.editorQuestionProject,
  parsons: m.editorQuestionParsons,
  program: m.editorQuestionProgram,
  puzzle: m.editorQuestionPuzzle,
};

const kindLabel = (kind: string) =>
  kind in KIND_LABEL ? KIND_LABEL[kind as QuestionKind]() : kind;

const fileUrl = (fileId: string) => `/files/${fileId}`;

/** Tags typed one at a time, each a chip that can be taken away again. */
function TagsField({
  tags,
  known,
  onChange,
}: {
  tags: string[];
  known: string[];
  onChange: (tags: string[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = (value: string) => {
    const tag = value.trim().slice(0, MAX_BANK_TAG);
    if (tag && !tags.includes(tag) && tags.length < MAX_BANK_TAGS)
      onChange([...tags, tag]);
    setDraft("");
  };
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{m.bankTags()}</Label>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary" className="gap-1 ps-2 pe-1">
                <bdi>{tag}</bdi>
                <button
                  type="button"
                  aria-label={m.bankTagRemove({ tag })}
                  className="grid size-4 place-items-center rounded-full hover:bg-foreground/10"
                  onClick={() => onChange(tags.filter((each) => each !== tag))}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          dir="auto"
          list={`${id}-known`}
          value={draft}
          maxLength={MAX_BANK_TAG}
          disabled={tags.length >= MAX_BANK_TAGS}
          placeholder={m.bankTagHint()}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            }
          }}
          className="max-md:h-10"
        />
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          disabled={!draft.trim() || tags.length >= MAX_BANK_TAGS}
          onClick={() => add(draft)}
        >
          <Plus aria-hidden />
          {m.bankTagAdd()}
        </Button>
      </div>
      <datalist id={`${id}-known`}>
        {known.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function KeepDialog({
  question,
  onClose,
}: {
  question: ContentDocument;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const known = useQuery({
    queryKey: ["bank", "list", "", "", "all"],
    queryFn: () => listBank({ data: { search: "", tag: "", scope: "all" } }),
  });
  const [tags, setTags] = useState<string[]>([]);
  const [scope, setScope] = useState<BankScope>("mine");
  const keep = useMutation({
    mutationFn: () =>
      saveBankQuestion({
        data: { id: "", expectedVersion: 0, scope, tags, content: question },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bank"] });
      toast.success(m.bankKept());
      onClose();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !keep.isPending) onClose();
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
              {m.bankKeepTitle()}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {m.bankKeepBody()}
            </DialogDescription>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <ContentView document={question} fileUrl={fileUrl} />
          </div>
          <TagsField
            tags={tags}
            known={known.data?.tags ?? []}
            onChange={setTags}
          />
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {m.bankKeepIn()}
            </legend>
            <RadioGroup
              value={scope}
              onValueChange={(value) => setScope(value as BankScope)}
              className="gap-2.5"
            >
              {(["mine", "school"] as const).map((value) => (
                <Label
                  key={value}
                  className="flex items-start gap-3 font-normal"
                >
                  <RadioGroupItem value={value} className="mt-0.5" />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">
                      {value === "mine" ? m.bankKeepMine() : m.bankKeepSchool()}
                    </span>
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {value === "mine"
                        ? m.bankScopeMineHint()
                        : m.bankScopeSchoolHint()}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={keep.isPending}
              onClick={onClose}
            >
              {m.docCancel()}
            </Button>
            <Button type="submit" disabled={keep.isPending}>
              {keep.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : null}
              {m.bankKeepAction()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Row = Awaited<ReturnType<typeof listBank>>["questions"][number];

/** One kept question: what it asks, and its preview on request. */
function BankRow({
  row,
  onAsk,
  pending,
}: {
  row: Row;
  onAsk: () => void;
  pending: boolean;
}) {
  const queryClient = useQueryClient();
  const [looking, setLooking] = useState(false);
  const preview = useQuery({
    queryKey: ["bank", "question", row.id, row.version],
    queryFn: () => openBankQuestion({ data: { id: row.id } }),
    enabled: looking,
  });
  const remove = useMutation({
    mutationFn: () => removeBankQuestion({ data: { id: row.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bank"] });
      toast.success(m.bankRemoved());
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
            <TextWithMath text={row.title} />
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {[
              kindLabel(row.kind),
              row.scope === "school" ? m.bankScopeSchool() : m.bankScopeMine(),
              row.mine ? null : owner,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {row.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {row.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="font-normal">
                  <bdi>{tag}</bdi>
                </Badge>
              ))}
            </span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {row.mine ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.bankRemove()}
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              className="max-md:size-10"
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={onAsk}
            className="max-md:h-10"
          >
            {m.bankAsk()}
          </Button>
        </div>
      </div>
      {looking ? (
        <div>
          {preview.data ? (
            <ContentView document={preview.data.content} fileUrl={fileUrl} />
          ) : (
            <div aria-busy="true" className="min-h-16" />
          )}
        </div>
      ) : null}
    </li>
  );
}

/** The bank, searched by words, tag and whose bank, to ask a kept question. */
function ChooseSheet({
  onChoose,
}: {
  onChoose: (content: ContentDocument | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [scope, setScope] = useState<"all" | BankScope>("all");
  const words = useDeferredValue(search.trim());
  const searchId = useId();
  const listed = useQuery({
    queryKey: ["bank", "list", words, tag, scope],
    queryFn: () => listBank({ data: { search: words, tag, scope } }),
    placeholderData: (previous) => previous,
  });
  const ask = useMutation({
    mutationFn: (id: string) => openBankQuestion({ data: { id } }),
    onSuccess: (result) => onChoose(result.content),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const end = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  const rows = listed.data?.questions ?? [];
  const tags = listed.data?.tags ?? [];
  return (
    <Sheet open onOpenChange={(open) => (open ? null : onChoose(null))}>
      <SheetContent
        side={end}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[480px] data-[side=right]:sm:max-w-[480px]"
      >
        <SheetHeader className="border-b px-5 py-3.5 pe-14">
          <SheetTitle className="text-base leading-6 font-semibold">
            {m.bankTitle()}
          </SheetTitle>
          <SheetDescription>{m.bankHint()}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 border-b px-5 py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Label htmlFor={searchId} className="sr-only">
              {m.bankSearch()}
            </Label>
            <Input
              id={searchId}
              type="search"
              dir="auto"
              value={search}
              placeholder={m.bankSearch()}
              onChange={(event) => setSearch(event.target.value)}
              className="ps-8 max-md:h-10"
            />
          </div>
          <fieldset
            aria-label={m.bankScope()}
            className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
          >
            {(["all", "mine", "school"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={scope === value ? "secondary" : "ghost"}
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
                className="max-md:h-9"
              >
                {value === "all"
                  ? m.bankScopeAll()
                  : value === "mine"
                    ? m.bankScopeMine()
                    : m.bankScopeSchool()}
              </Button>
            ))}
          </fieldset>
          {tags.length > 0 ? (
            <fieldset
              aria-label={m.bankTags()}
              className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
            >
              {tags.map((each) => (
                <Button
                  key={each}
                  type="button"
                  size="xs"
                  variant={tag === each ? "secondary" : "outline"}
                  aria-pressed={tag === each}
                  onClick={() => setTag(tag === each ? "" : each)}
                >
                  <bdi>{each}</bdi>
                </Button>
              ))}
            </fieldset>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {listed.isPending ? (
            <div aria-busy="true" className="min-h-24" />
          ) : rows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {words || tag ? m.bankNoneFound() : m.bankEmpty()}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <BankRow
                  key={row.id}
                  row={row}
                  pending={ask.isPending}
                  onAsk={() => ask.mutate(row.id)}
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
 * The question bank an editor keeps questions in and asks them from, where
 * the document may ask questions at all.
 */
export function useEditorBank(questions: boolean): {
  bank: EditorBank | undefined;
  dialog: ReactNode;
} {
  const queryClient = useQueryClient();
  const [keeping, setKeeping] = useState<ContentDocument | null>(null);
  const [choosing, setChoosing] = useState<
    ((content: ContentDocument | null) => void) | null
  >(null);
  const bank = useMemo<EditorBank | undefined>(
    () =>
      questions
        ? {
            keep: (question) => setKeeping(question),
            choose: () =>
              new Promise((resolve) => {
                setChoosing(() => resolve);
              }),
            tags: () =>
              queryClient.fetchQuery({
                queryKey: ["bank", "tags"],
                queryFn: () => bankTags(),
                staleTime: 30_000,
              }),
          }
        : undefined,
    [questions, queryClient],
  );
  return {
    bank,
    dialog: (
      <>
        {keeping ? (
          <KeepDialog question={keeping} onClose={() => setKeeping(null)} />
        ) : null}
        {choosing ? (
          <ChooseSheet
            onChoose={(content) => {
              choosing(content);
              setChoosing(null);
            }}
          />
        ) : null}
      </>
    ),
  };
}
