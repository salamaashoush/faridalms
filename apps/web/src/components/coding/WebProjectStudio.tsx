import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { ProjectFile } from "@faridalms/domain/project";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  entryOf,
  fileKind,
  fileNameIssue,
  MAX_PROJECT_BYTES,
  MAX_PROJECT_FILES,
  projectBytes,
} from "@faridalms/domain/project";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { Input } from "@faridalms/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@faridalms/ui/tooltip";
import {
  Info,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { ActionMenu } from "~/components/system/ActionMenu";
import { ConfirmDialog } from "~/components/system/ConfirmDialog";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type * as CodeEditor from "./code-editor";
import type { SaveState } from "./CodingStudio";

import { SaveStatus } from "./CodingStudio";
import { linkedPage, playedPage } from "./project-page";
import { WebPreview } from "./WebPreview";

/** Quiet time after the last change before a project keeps itself. */
const KEEP_MS = 2000;
/** How long typing pauses before the page is drawn again. */
const REDRAW_MS = 800;

/** A file open in the studio; its number stays its own through a rename. */
interface Open extends ProjectFile {
  id: number;
}

const opened = (files: readonly ProjectFile[]): Open[] =>
  files.map((file, index) => ({ ...file, id: index + 1 }));
const plain = (files: readonly Open[]): ProjectFile[] =>
  files.map(({ name, code }) => ({ name, code }));

const languageOf = (name: string): CodeEditor.CodeLanguage => {
  const kind = fileKind(name);
  return kind === "css" ? "css" : kind === "js" ? "javascript" : "html";
};

/**
 * A web project over the page: its files to write on one side, the page
 * they make on the other, drawn again as the student types. The project is
 * kept a moment after the last change and always before the studio closes.
 */
export function WebProjectStudio({
  title,
  files: given,
  starter,
  note,
  onKeep,
  unkept = false,
  action,
  onClose,
}: {
  title: string;
  files: readonly ProjectFile[];
  /** What starting again gives back; none offers no way to. */
  starter?: readonly ProjectFile[] | undefined;
  /** Something the student should know before they carry on. */
  note?: string | undefined;
  /**
   * Keeps the project as it is built; without it, closing hands it over.
   * `fresh` says the student began again from what they were given.
   */
  onKeep?:
    | ((files: ProjectFile[], fresh: boolean) => Promise<unknown>)
    | undefined;
  /** Nothing changed here lasts, as when a teacher tries a student's project. */
  unkept?: boolean;
  /** Something more the project can be used for, beside the way out. */
  action?: { label: string; onSelect: () => void } | undefined;
  onClose: (files: ProjectFile[]) => void;
}) {
  const keysId = useId();
  const done = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const tools = useRef<typeof CodeEditor | null>(null);
  const states = useRef(new Map<number, EditorState>());
  const [files, setFiles] = useState(() => opened(given));
  const latest = useRef(files);
  const lastId = useRef(files.length);
  const [active, setActive] = useState(
    () =>
      files.find((file) => file.name === entryOf(given))?.id ??
      files[0]?.id ??
      0,
  );
  const showing = useRef(active);
  const [page, setPage] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(() => playedPage(files, null));
  const [pane, setPane] = useState<"code" | "page">("code");
  const [state, setState] = useState<SaveState>("idle");
  const [naming, setNaming] = useState<{ id: number | null } | null>(null);
  const [removing, setRemoving] = useState<Open | null>(null);
  const [restarting, setRestarting] = useState(false);
  const dirty = useRef(false);
  const changes = useRef(0);
  const fresh = useRef(false);
  const keepTimer = useRef(0);
  const drawTimer = useRef(0);
  const closing = useRef(false);
  const shownPage = useRef(page);

  const tooLarge = projectBytes(plain(files)) > MAX_PROJECT_BYTES;
  const pages = files.filter((file) => fileKind(file.name) === "html");

  const keep = async (): Promise<boolean> => {
    window.clearTimeout(keepTimer.current);
    if (!onKeep || !dirty.current) return true;
    const kept = plain(latest.current);
    if (projectBytes(kept) > MAX_PROJECT_BYTES) {
      setState("failed");
      return false;
    }
    dirty.current = false;
    const sent = changes.current;
    const began = fresh.current;
    setState("saving");
    try {
      await onKeep(kept, began);
      if (changes.current === sent) fresh.current = false;
      // A change made while this was on its way waits for the next.
      setState(changes.current === sent ? "saved" : "idle");
      return true;
    } catch {
      dirty.current = true;
      setState("failed");
      return false;
    }
  };

  const draw = (next: readonly Open[], shown: string | null) => {
    window.clearTimeout(drawTimer.current);
    setDrawn(playedPage(next, shown));
  };

  /** Takes a change to the project: kept soon, drawn sooner. */
  const changed = (next: Open[], redraw: "soon" | "now") => {
    latest.current = next;
    setFiles(next);
    if (onKeep) {
      dirty.current = true;
      changes.current += 1;
      setState("idle");
      window.clearTimeout(keepTimer.current);
      keepTimer.current = window.setTimeout(() => void keep(), KEEP_MS);
    }
    window.clearTimeout(drawTimer.current);
    if (redraw === "now") draw(next, shownPage.current);
    else
      drawTimer.current = window.setTimeout(
        () => draw(latest.current, shownPage.current),
        REDRAW_MS,
      );
  };

  // An editor's code outlives the render it was made in, so it reaches
  // these through whichever render came last.
  const act = useRef({ changed, draw });
  useEffect(() => {
    act.current = { changed, draw };
  });

  const stateOf = (file: Open) => {
    const kept = states.current.get(file.id);
    if (kept || !tools.current) return kept;
    const made = tools.current.createCodeState({
      code: file.code,
      language: languageOf(file.name),
      label: file.name,
      describedBy: keysId,
      readOnly: false,
      onChange: (code) =>
        act.current.changed(
          latest.current.map((item) =>
            item.id === file.id ? { ...item, code } : item,
          ),
          "soon",
        ),
      onRun: () => act.current.draw(latest.current, shownPage.current),
    });
    states.current.set(file.id, made);
    return made;
  };

  /** Turns the editor to a file, leaving the one it showed as it was. */
  const turnTo = (id: number, among: readonly Open[] = latest.current) => {
    const file = among.find((item) => item.id === id);
    if (!file) return;
    if (view.current && showing.current !== id) {
      if (among.some((item) => item.id === showing.current))
        states.current.set(showing.current, view.current.state);
      const next = stateOf(file);
      if (next) view.current.setState(next);
    }
    showing.current = id;
    setActive(id);
  };

  const show = (name: string | null) => {
    shownPage.current = name;
    setPage(name);
    draw(latest.current, name);
  };

  const mount = useEffectEvent(
    (loaded: typeof CodeEditor, parent: HTMLElement) => {
      tools.current = loaded;
      const file = latest.current.find((item) => item.id === showing.current);
      const first = file ? stateOf(file) : undefined;
      if (first) view.current = loaded.showCode(parent, first);
    },
  );
  useEffect(() => {
    let cancelled = false;
    void import("./code-editor").then((loaded) => {
      if (!cancelled && host.current) mount(loaded, host.current);
    });
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      cancelled = true;
      view.current?.destroy();
      view.current = null;
      window.removeEventListener("beforeunload", warn);
      window.clearTimeout(keepTimer.current);
      window.clearTimeout(drawTimer.current);
    };
  }, []);

  const close = async () => {
    if (closing.current) return;
    closing.current = true;
    const kept = await keep();
    closing.current = false;
    if (kept) onClose(plain(latest.current));
    else toast.error(tooLarge ? m.projectTooLarge() : m.studioSaveFailed());
  };

  const name = (id: number | null, to: string) => {
    if (id === null) {
      lastId.current += 1;
      const added = { id: lastId.current, name: to, code: "" };
      const next = [...latest.current, added];
      changed(next, "now");
      turnTo(added.id, next);
    } else {
      // A renamed file may change kind, so it is coloured afresh.
      const before = latest.current.find((item) => item.id === id);
      const next = latest.current.map((item) =>
        item.id === id ? { ...item, name: to } : item,
      );
      if (before && languageOf(before.name) !== languageOf(to)) {
        states.current.delete(id);
        if (showing.current === id) showing.current = 0;
      }
      if (shownPage.current === before?.name) shownPage.current = to;
      changed(next, "now");
      setPage(shownPage.current);
      turnTo(id, next);
    }
    setNaming(null);
  };

  const remove = (file: Open) => {
    const next = latest.current.filter((item) => item.id !== file.id);
    states.current.delete(file.id);
    if (shownPage.current === file.name) {
      shownPage.current = null;
      setPage(null);
    }
    changed(next, "now");
    if (showing.current === file.id) turnTo(next[0]?.id ?? 0, next);
    setRemoving(null);
  };

  const restart = () => {
    if (!starter) return;
    const next = opened(starter).map((file) => ({
      ...file,
      id: lastId.current + file.id,
    }));
    lastId.current += next.length;
    states.current.clear();
    shownPage.current = null;
    setPage(null);
    fresh.current = true;
    changed(next, "now");
    showing.current = 0;
    turnTo(
      next.find((file) => file.name === entryOf(starter))?.id ??
        next[0]?.id ??
        0,
      next,
    );
    setRestarting(false);
  };

  const onlyPage = (file: Open) =>
    fileKind(file.name) === "html" && pages.length === 1;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          initialFocus={done}
          className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none"
        >
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 lg:px-3">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="max-md:size-10"
                    aria-label={m.studioClose()}
                    onClick={() => void close()}
                  />
                }
              >
                <X aria-hidden />
              </TooltipTrigger>
              <TooltipContent>{m.studioClose()}</TooltipContent>
            </Tooltip>
            <div className="grid min-w-0 flex-1">
              <DialogPrimitive.Title className="text-sm leading-5 font-semibold">
                {m.projectStudioTitle()}
              </DialogPrimitive.Title>
              <p className="truncate text-[13px] leading-[18px] text-muted-foreground">
                <bdi>{title}</bdi>
              </p>
            </div>
            {onKeep ? (
              <SaveStatus state={state} />
            ) : unkept ? (
              <span className="text-[13px] text-muted-foreground max-sm:sr-only">
                {m.studioNotKept()}
              </span>
            ) : null}
            {starter ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="max-md:size-10 max-md:px-0"
                onClick={() => setRestarting(true)}
              >
                <RotateCcw aria-hidden />
                <span className="max-md:sr-only">{m.projectRestart()}</span>
              </Button>
            ) : null}
            {action ? (
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={action.onSelect}
              >
                {action.label}
              </Button>
            ) : null}
            <Button
              ref={done}
              type="button"
              className="max-md:h-10"
              disabled={state === "saving"}
              onClick={() => void close()}
            >
              {m.studioDone()}
            </Button>
          </header>
          {tooLarge ? (
            <p
              role="alert"
              className="flex shrink-0 items-start gap-2 border-b bg-destructive/10 px-3 py-2 text-[13px] leading-[18px] text-destructive"
            >
              <TriangleAlert aria-hidden className="mt-px size-4 shrink-0" />
              {m.projectTooLarge()}
            </p>
          ) : note ? (
            <p className="flex shrink-0 items-start gap-2 border-b bg-muted/50 px-3 py-2 text-[13px] leading-[18px] text-muted-foreground">
              <Info aria-hidden className="mt-px size-4 shrink-0" />
              {note}
            </p>
          ) : null}
          <fieldset className="flex min-w-0 shrink-0 gap-1 border-b p-1.5 lg:hidden">
            <legend className="sr-only">{m.projectShow()}</legend>
            {(["code", "page"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                variant={pane === item ? "secondary" : "ghost"}
                className="h-10 flex-1"
                aria-pressed={pane === item}
                onClick={() => {
                  if (item === "page") draw(latest.current, shownPage.current);
                  setPane(item);
                }}
              >
                {item === "code" ? m.projectCode() : m.projectPage()}
              </Button>
            ))}
          </fieldset>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <section
              aria-label={m.projectCode()}
              className={cn(
                "min-h-0 min-w-0 flex-1 flex-col lg:flex lg:border-e",
                pane === "code" ? "flex" : "hidden",
              )}
            >
              <FileTabs
                files={files}
                active={active}
                full={files.length >= MAX_PROJECT_FILES}
                onlyPage={onlyPage}
                onTurn={(id) => turnTo(id)}
                onAdd={() => setNaming({ id: null })}
                onRename={(file) => setNaming({ id: file.id })}
                onRemove={setRemoving}
              />
              <div
                ref={host}
                dir="ltr"
                className="fe min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
              />
              <p id={keysId} className="sr-only">
                {m.projectKeys()}
              </p>
            </section>
            <section
              aria-label={m.projectPage()}
              className={cn(
                "min-h-0 min-w-0 flex-1 flex-col lg:flex",
                pane === "page" ? "flex" : "hidden",
              )}
            >
              <div className="flex h-11 shrink-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto border-b px-2">
                {pages.length > 1 ? (
                  pages.map((file) => {
                    const on =
                      file.name === (page ?? entryOf(plain(files)) ?? "");
                    return (
                      <Button
                        key={file.id}
                        type="button"
                        variant={on ? "secondary" : "ghost"}
                        size="sm"
                        dir="ltr"
                        className="shrink-0 font-mono text-[13px] max-md:h-10"
                        aria-pressed={on}
                        onClick={() => show(file.name)}
                      >
                        {file.name}
                      </Button>
                    );
                  })
                ) : (
                  <span
                    dir="ltr"
                    className="px-1.5 font-mono text-[13px] text-muted-foreground"
                  >
                    {pages[0]?.name}
                  </span>
                )}
                <span className="flex-1" />
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 max-md:size-10"
                        aria-label={m.projectPlayAgain()}
                        onClick={() => draw(latest.current, shownPage.current)}
                      />
                    }
                  >
                    <RotateCw aria-hidden />
                  </TooltipTrigger>
                  <TooltipContent>{m.projectPlayAgain()}</TooltipContent>
                </Tooltip>
              </div>
              <WebPreview
                page={drawn}
                fill
                onOpen={(href) => {
                  const next = linkedPage(latest.current, href);
                  if (next) show(next);
                  return next !== null;
                }}
              />
            </section>
          </div>
          {naming ? (
            <NameDialog
              file={files.find((file) => file.id === naming.id) ?? null}
              others={files
                .filter((file) => file.id !== naming.id)
                .map((file) => file.name)}
              onName={(to) => name(naming.id, to)}
              onCancel={() => setNaming(null)}
            />
          ) : null}
          <ConfirmDialog
            open={removing !== null}
            title={m.projectDeleteTitle({ name: removing?.name ?? "" })}
            body={m.projectDeleteBody()}
            confirmLabel={m.filesDelete()}
            onConfirm={() => {
              if (removing) remove(removing);
            }}
            onCancel={() => setRemoving(null)}
          />
          <ConfirmDialog
            open={restarting}
            title={m.projectRestartTitle()}
            body={m.projectRestartBody()}
            confirmLabel={m.projectRestart()}
            onConfirm={restart}
            onCancel={() => setRestarting(false)}
          />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function FileTabs({
  files,
  active,
  full,
  onlyPage,
  onTurn,
  onAdd,
  onRename,
  onRemove,
}: {
  files: readonly Open[];
  active: number;
  full: boolean;
  onlyPage: (file: Open) => boolean;
  onTurn: (id: number) => void;
  onAdd: () => void;
  onRename: (file: Open) => void;
  onRemove: (file: Open) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  // A file turned to from elsewhere, as a new one is, may sit out of view.
  useEffect(() => {
    list.current
      ?.querySelector(`[data-file="${active}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  const step = (from: number, by: number) => {
    const next = files[(from + by + files.length) % files.length];
    if (!next) return;
    onTurn(next.id);
    list.current
      ?.querySelector<HTMLElement>(`[data-file="${next.id}"]`)
      ?.focus();
  };
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
      <div
        ref={list}
        role="tablist"
        aria-label={m.projectFiles()}
        className="flex min-w-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto"
      >
        {files.map((file, index) => {
          const on = file.id === active;
          return (
            <div
              key={file.id}
              className={cn(
                "flex shrink-0 items-center rounded-md",
                on && "bg-muted",
              )}
            >
              <button
                type="button"
                role="tab"
                data-file={file.id}
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                dir="ltr"
                className={cn(
                  "h-8 rounded-md px-2.5 font-mono text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-10",
                  on
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onTurn(file.id)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                    return;
                  event.preventDefault();
                  const rtl =
                    list.current !== null &&
                    getComputedStyle(list.current).direction === "rtl";
                  step(index, (event.key === "ArrowRight") === rtl ? -1 : 1);
                }}
              >
                {file.name}
              </button>
              {on ? (
                <ActionMenu
                  label={m.projectFileMenu({ name: file.name })}
                  className="max-md:size-10"
                  actions={[
                    {
                      label: m.filesRename(),
                      icon: Pencil,
                      onSelect: () => onRename(file),
                    },
                    ...(onlyPage(file)
                      ? []
                      : [
                          {
                            label: m.filesDelete(),
                            icon: Trash2,
                            onSelect: () => onRemove(file),
                          },
                        ]),
                  ]}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 max-md:size-10"
              aria-label={m.projectAddFile()}
              disabled={full}
              onClick={onAdd}
            />
          }
        >
          <Plus aria-hidden />
        </TooltipTrigger>
        <TooltipContent>
          {full
            ? m.projectFull({ count: formatNumber(MAX_PROJECT_FILES) })
            : m.projectAddFile()}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Names a new file, or gives one another name. */
function NameDialog({
  file,
  others,
  onName,
  onCancel,
}: {
  file: Open | null;
  others: readonly string[];
  onName: (name: string) => void;
  onCancel: () => void;
}) {
  const hintId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(file?.name ?? "");
  const [tried, setTried] = useState(false);
  const issue = fileNameIssue(name.trim(), others);
  const said =
    tried && issue
      ? issue === "learning.project_file_taken"
        ? m.projectFileTaken()
        : m.projectFileBad()
      : null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={field}
        className="gap-5 sm:max-w-md"
      >
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            // The page's own form would otherwise take this as its answer.
            event.stopPropagation();
            setTried(true);
            if (!issue) onName(name.trim());
          }}
        >
          <div className="grid gap-2">
            <DialogTitle className="text-base font-semibold">
              {file
                ? m.projectRenameTitle({ name: file.name })
                : m.projectAddFile()}
            </DialogTitle>
            <DialogDescription
              id={hintId}
              className="text-sm text-muted-foreground"
            >
              {m.projectFileHint()}
            </DialogDescription>
          </div>
          <div className="grid gap-1.5">
            <Input
              ref={field}
              dir="ltr"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label={m.projectFileName()}
              aria-describedby={hintId}
              aria-invalid={said !== null}
              placeholder="about.html"
              className="font-mono"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {said ? (
              <p
                role="alert"
                className="text-[13px] leading-[18px] text-destructive"
              >
                {said}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              {m.docCancel()}
            </Button>
            <Button type="submit">
              {file ? m.filesRename() : m.projectFileAdd()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
