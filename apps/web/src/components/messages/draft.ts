import type { SaveDraft } from "@faridalms/domain/messages";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAutosave } from "~/hooks/useAutosave";
import * as m from "~/i18n/messages";
import { saveMessageDraft } from "~/server/messages";
import { getMessageFromError } from "~/utils/error";

export interface DraftRef {
  id: string;
  version: number;
}

const NONE: DraftRef = { id: "", version: 0 };

/**
 * Keeps what a composer holds as a draft while someone writes, one save at
 * a time, each naming the version the last one returned, so a draft
 * changed in another tab or sent already is refused rather than
 * overwritten. A save that empties a draft lets it go.
 */
export function useMessageDraft<T>({
  value,
  initial,
  toDraft,
  enabled = true,
  delay = 800,
  onKept,
}: {
  value: T;
  initial: DraftRef | null;
  toDraft: (value: T) => Omit<SaveDraft, "id" | "version">;
  enabled?: boolean;
  delay?: number;
  onKept?: (draft: DraftRef) => void;
}) {
  const kept = useRef<DraftRef>(initial ?? NONE);
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState(Boolean(initial?.id));
  const latest = useRef({ toDraft, onKept });
  useEffect(() => {
    latest.current = { toDraft, onKept };
  });
  const save = useCallback(async (next: T) => {
    try {
      const saved = await saveMessageDraft({
        data: { ...latest.current.toDraft(next), ...kept.current },
      });
      kept.current = saved;
      setHeld(saved.id !== "");
      setError(null);
      latest.current.onKept?.(saved);
    } catch (failure) {
      setError(getMessageFromError(failure));
      throw failure;
    }
  }, []);
  const autosave = useAutosave({ value, save, enabled, delay });
  return {
    ...autosave,
    error,
    /** Whether a draft is kept on the server now. */
    held,
    /** The draft as last kept, to send or delete it by. */
    current: () => kept.current,
    /** What was sent from here: the server let the draft go with it. */
    sent: (empty: T) => {
      kept.current = NONE;
      setHeld(false);
      setError(null);
      autosave.markSaved(empty);
    },
    status:
      autosave.state === "saving"
        ? m.msgDraftSaving()
        : autosave.state === "error"
          ? m.msgDraftFailed()
          : autosave.state === "saved" && held
            ? m.msgDraftSaved()
            : null,
  };
}
