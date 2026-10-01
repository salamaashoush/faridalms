import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Saves a draft about `delay` after the last change, one request at a time.
 * A change made while a save is in flight is saved once it lands. Ctrl/Cmd+S
 * saves at once, and leaving the page with a save pending asks first.
 */
export function useAutosave<T>({
  value,
  save,
  enabled = true,
  delay = 1500,
}: {
  value: T;
  save: (value: T) => Promise<void>;
  enabled?: boolean;
  delay?: number;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const serialized = JSON.stringify(value);
  const [savedSnapshot, setSavedSnapshot] = useState(serialized);
  const saved = useRef(serialized);
  const pending = useRef<string | null>(null);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSave = useRef(save);
  const inflight = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latestSave.current = save;
  }, [save]);

  const run = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (running.current) return inflight.current;
    running.current = true;
    const step = async (): Promise<boolean> => {
      const next = pending.current;
      if (next === null) return false;
      if (next === saved.current) {
        pending.current = null;
        return false;
      }
      setState("saving");
      await latestSave.current(JSON.parse(next) as T);
      saved.current = next;
      setSavedSnapshot(next);
      if (pending.current === next) pending.current = null;
      await step();
      return true;
    };
    inflight.current = (async () => {
      try {
        if (await step()) setState("saved");
      } catch {
        setState("error");
      } finally {
        running.current = false;
      }
    })();
    return inflight.current;
  }, []);

  useEffect(() => {
    if (!enabled || serialized === saved.current) return undefined;
    pending.current = serialized;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), delay);
    return undefined;
  }, [serialized, enabled, delay, run]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flush = useCallback(() => {
    if (pending.current !== null) void run();
  }, [run]);

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (enabled) {
        pending.current = serialized;
        void run();
      }
    }
  });

  const onLeave = useEffectEvent((event: BeforeUnloadEvent) => {
    if (running.current || pending.current !== null) event.preventDefault();
  });

  useEffect(() => {
    const key = (event: KeyboardEvent) => onKey(event);
    const leave = (event: BeforeUnloadEvent) => onLeave(event);
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);

  /** Cancels a save not yet started and waits for the one under way. */
  const settle = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    await inflight.current;
  }, []);

  const markSaved = useCallback((next: T) => {
    const snapshot = JSON.stringify(next);
    saved.current = snapshot;
    pending.current = null;
    setSavedSnapshot(snapshot);
  }, []);

  return {
    state,
    flush,
    retry: flush,
    dirty: serialized !== savedSnapshot,
    busy: () => running.current || pending.current !== null,
    markSaved,
    settle,
  };
}
