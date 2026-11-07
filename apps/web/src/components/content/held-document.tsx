import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { ReactNode } from "react";

import { contentPlainText } from "@faridalms/domain/content";
import { HOLD_RENEW_SECONDS } from "@faridalms/domain/document-holds";
import { EditingHold } from "@faridalms/ui/system/editing-hold";
import { VersionCompare } from "@faridalms/ui/system/version-compare";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { Autosave } from "~/hooks/useAutosave";
import type { DocumentHost } from "~/queries/documents";

import { ContentView } from "~/components/content/ContentView";
import { useAutosave } from "~/hooks/useAutosave";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { holdDocument, releaseDocument } from "~/server/documents";
import {
  formatInstant,
  formatTime,
  schoolClockAt,
  schoolDayOf,
} from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Answer = Awaited<ReturnType<typeof holdDocument>>;

/**
 * Who holds the document as this editor sees it: nobody it needs to ask
 * (not stored yet, or not answered), the viewer, someone else while the
 * viewer reads, or someone who took it from the viewer.
 */
export type HoldState =
  | { kind: "open" }
  | { kind: "mine" }
  | { kind: "theirs" | "taken"; holder: string; since: string };

/** A version as it is stored, with the version number a save must name. */
export interface StoredVersion<T> {
  value: T;
  version: number;
}

export interface HeldDocumentOptions<T, S extends StoredVersion<T>> {
  /** The record whose document this is; null until its first save stores it. */
  host: DocumentHost | null;
  value: T;
  save: (value: T) => Promise<void>;
  /** Whether it may be saved at all, whoever holds it. */
  enabled?: boolean;
  delay?: number;
  /** The version the next save names. */
  version: () => number;
  /** The version stored now, read afresh. */
  latest: () => Promise<S>;
  /** Puts a stored version on screen, with whatever else the page keeps of it. */
  adopt: (stored: S) => void;
  /** Bases the next save on a version stored meanwhile. */
  rebase: (version: number) => void;
  /** A version drawn as its readers see it, for comparing two. */
  render: (value: T) => ReactNode;
  /** A version as plain text, to copy somewhere else. */
  text: (value: T) => string;
}

/** What a document page shows and does about who is editing it. */
export interface HeldEditing {
  /** Whether the viewer may change the document now. */
  editable: boolean;
  /** The line above the document while someone else holds it. */
  notice: ReactNode;
  /** The screen comparing the viewer's version with the stored one, when open. */
  compare: ReactNode;
  /** Takes over a refusal the page caught itself; false for any other failure. */
  handles: (error: unknown) => boolean;
}

interface Comparing<T, S> {
  reason: "stale" | "taken";
  mine: T;
  saved: S | null;
}

const sinceOf = (iso: string) =>
  schoolDayOf(iso) === schoolDayOf(new Date())
    ? formatTime(schoolClockAt(new Date(iso)))
    : formatInstant(iso);

const holderOf = (answer: Answer) =>
  inLocale(answer.holder.nameEn, answer.holder.nameAr) || m.docHoldSomeone();

const codeOf = (error: unknown) =>
  error instanceof Error ? error.message : "";

/**
 * Saves a document as it is written while the viewer holds it, one person
 * at a time. The open editor holds the record and renews the hold; anyone
 * else who opens it reads it, sees who holds it and may take it over,
 * and picks up the stored version once it is theirs. A save refused as
 * stale, or a change left unsaved when the document was taken, opens the
 * compare screen to keep one version.
 */
export function useHeldDocument<T, S extends StoredVersion<T>>(
  options: HeldDocumentOptions<T, S>,
): { autosave: Autosave<T>; editing: HeldEditing } {
  const hostType = options.host?.hostType ?? null;
  const hostId = options.host?.hostId ?? null;
  const [hold, setHold] = useState<HoldState>({ kind: "open" });
  const [taking, setTaking] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [compare, setCompare] = useState<Comparing<T, S> | null>(null);
  const editable = hold.kind === "open" || hold.kind === "mine";
  const autosave = useAutosave({
    value: options.value,
    save: options.save,
    enabled: (options.enabled ?? true) && editable,
    delay: options.delay,
  });
  // Read by renewals and saves that land after the render that began them.
  const kind = useRef<HoldState["kind"]>("open");

  const ask = (take: boolean): Promise<Answer | null> =>
    hostType && hostId
      ? holdDocument({ data: { hostType, hostId, take } })
      : Promise.resolve(null);

  const show = (next: HoldState) => {
    kind.current = next.kind;
    setHold(next);
  };

  const adopt = (stored: S) => {
    options.adopt(stored);
    autosave.markSaved(stored.value);
  };

  const openCompare = async (reason: Comparing<T, S>["reason"]) => {
    setCompare({ reason, mine: options.value, saved: null });
    try {
      const saved = await options.latest();
      setCompare((current) => (current ? { ...current, saved } : current));
    } catch (error) {
      setCompare(null);
      toast.error(getMessageFromError(error));
    }
  };

  /**
   * The document is the viewer's again after someone else held it: the
   * stored version replaces what was read, and a change the viewer could
   * not save is saved where nothing was stored meanwhile, or compared.
   */
  const regain = async (from: HoldState["kind"]) => {
    const stored = await options.latest();
    const unchanged = stored.version === options.version();
    if (from === "taken" && autosave.dirty) {
      // A change that waits for the page's own word, such as Update, waits on.
      if (!unchanged) await openCompare("stale");
      else if (options.enabled ?? true) await autosave.saveNow();
    } else if (!unchanged) adopt(stored);
  };

  const learn = async (answer: Answer | null) => {
    if (!answer) return;
    const before = kind.current;
    if (answer.mine) {
      show({ kind: "mine" });
      if (before === "theirs" || before === "taken") await regain(before);
      return;
    }
    // Someone else has it: taken from the viewer if they were writing it.
    const writing =
      before === "mine" ||
      before === "taken" ||
      (before === "open" && autosave.dirty);
    show({
      kind: writing ? "taken" : "theirs",
      holder: holderOf(answer),
      since: sinceOf(answer.since),
    });
  };

  // Renews the viewer's hold, or watches for whoever has it to leave while
  // keeping what is read current. Once taken, it waits to be asked.
  const tick = async () => {
    if (kind.current === "taken") return;
    await learn(await ask(false));
    if (kind.current !== "theirs") return;
    const stored = await options.latest();
    if (stored.version !== options.version()) adopt(stored);
  };

  const handle = (error: unknown) => {
    const code = codeOf(error);
    if (code === "conflict.version") {
      void openCompare("stale");
      return true;
    }
    if (code === "documents.held") {
      ask(false).then(learn, (failed: unknown) =>
        toast.error(getMessageFromError(failed)),
      );
      return true;
    }
    return false;
  };

  const actions = useRef({ ask, learn, tick, handle });
  useEffect(() => {
    actions.current = { ask, learn, tick, handle };
  });

  useEffect(() => {
    if (!hostType || !hostId) return undefined;
    actions.current
      .ask(false)
      .then((answer) => actions.current.learn(answer))
      .catch(() => {
        // Without an answer it edits as before; the next renewal asks again.
      });
    const timer = setInterval(() => {
      actions.current.tick().catch(() => {
        // A renewal that did not arrive is tried again at the next one.
      });
    }, HOLD_RENEW_SECONDS * 1000);
    const release = () => {
      if (kind.current === "mine")
        releaseDocument({ data: { hostType, hostId } }).catch(() => {});
    };
    window.addEventListener("pagehide", release);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
      release();
      kind.current = "open";
      setHold({ kind: "open" });
    };
  }, [hostType, hostId]);

  const handles = useCallback(
    (error: unknown) => actions.current.handle(error),
    [],
  );
  const failure = autosave.failure;
  useEffect(() => {
    if (failure) handles(failure);
  }, [failure, handles]);

  /** Takes the document over; resolves whether it is the viewer's now. */
  const takeOver = async (then: "regain" | "keep") => {
    const before = kind.current;
    setTaking(true);
    try {
      const answer = await ask(true);
      if (!answer?.mine) {
        await learn(answer);
        return false;
      }
      show({ kind: "mine" });
      if (then === "regain") await regain(before);
      return true;
    } catch (error) {
      toast.error(getMessageFromError(error));
      return false;
    } finally {
      setTaking(false);
    }
  };

  const keepMine = async (saved: S) => {
    setKeeping(true);
    try {
      if (kind.current === "theirs" || kind.current === "taken")
        if (!(await takeOver("keep"))) return;
      options.rebase(saved.version);
      if (await autosave.saveNow()) setCompare(null);
    } finally {
      setKeeping(false);
    }
  };

  const copy = () =>
    navigator.clipboard.writeText(options.text(options.value)).then(
      () => toast.success(m.docHoldCopied()),
      () => toast.error(m.docCopyFailed()),
    );

  const notice =
    hold.kind === "theirs" || hold.kind === "taken" ? (
      <EditingHold
        state={hold.kind === "theirs" ? "held" : "taken"}
        holder={hold.holder}
        since={hold.since}
        onTakeOver={() => void takeOver("regain")}
        taking={taking}
        unsaved={
          hold.kind === "taken" && autosave.dirty
            ? {
                onCopy: () => void copy(),
                onCompare: () => void openCompare("taken"),
              }
            : undefined
        }
      />
    ) : null;

  const saved = compare?.saved ?? null;
  return {
    autosave,
    editing: {
      editable,
      notice,
      compare: compare ? (
        <VersionCompare
          open
          onOpenChange={(open) => {
            if (!open) setCompare(null);
          }}
          reason={compare.reason}
          holder={hold.kind === "taken" ? hold.holder : undefined}
          mine={options.render(compare.mine)}
          saved={saved ? options.render(saved.value) : null}
          onKeepMine={() => {
            if (saved) void keepMine(saved);
          }}
          onKeepSaved={() => {
            if (saved) adopt(saved);
            setCompare(null);
          }}
          pending={keeping}
        />
      ) : null,
      handles,
    },
  };
}

export interface DocumentVersionProps {
  title: string;
  body: ContentDocument;
  /** The language it is written in. */
  lang: ContentLocale;
}

/** One version of a document as its readers see it, for the compare screen. */
export function DocumentVersion({ title, body, lang }: DocumentVersionProps) {
  return (
    <div lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <h4 className="mb-3 text-xl leading-7 font-semibold">{title}</h4>
      <ContentView
        document={body}
        lang={lang}
        fileUrl={(fileId) => `/files/${fileId}`}
      />
    </div>
  );
}

/** A document's title and words as plain text, for copying a version elsewhere. */
export const documentText = (title: string, body: ContentDocument) =>
  [title.trim(), contentPlainText(body)].filter(Boolean).join("\n\n");
