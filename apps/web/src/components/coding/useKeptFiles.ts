import type { ProjectFile } from "@faridalms/domain/project";

import { MAX_PROJECT_BYTES, projectBytes } from "@faridalms/domain/project";
import { useEffect, useRef, useState } from "react";

import type { SaveState } from "./CodingStudio";

/** How long after the last change a project is kept. */
const KEEP_MS = 2000;

/**
 * Keeps a project as it is built: a moment after the last change, and
 * whenever asked, as before a studio closes. A change made while one is on
 * its way waits for the next, and a project grown too large is not sent.
 * Leaving the page with a change unkept asks first.
 */
export function useKeptFiles(
  onKeep:
    | ((files: ProjectFile[], fresh: boolean) => Promise<unknown>)
    | undefined,
) {
  const [state, setState] = useState<SaveState>("idle");
  const latest = useRef<ProjectFile[]>([]);
  const dirty = useRef(false);
  const changes = useRef(0);
  const fresh = useRef(false);
  const timer = useRef(0);

  const keep = async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (!onKeep || !dirty.current) return true;
    if (projectBytes(latest.current) > MAX_PROJECT_BYTES) {
      setState("failed");
      return false;
    }
    dirty.current = false;
    const sent = changes.current;
    const began = fresh.current;
    setState("saving");
    try {
      await onKeep(latest.current, began);
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

  /**
   * Takes the project as it now stands, to keep soon. `began` says the
   * student started again from what they were given.
   */
  const changed = (files: ProjectFile[], began = false) => {
    latest.current = files;
    if (!onKeep) return;
    if (began) fresh.current = true;
    dirty.current = true;
    changes.current += 1;
    setState("idle");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void keep(), KEEP_MS);
  };

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.clearTimeout(timer.current);
    };
  }, []);

  return { state, changed, keep };
}
