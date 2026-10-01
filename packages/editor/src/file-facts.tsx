import type { ReactNode } from "react";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import type { FileFacts } from "./files";

type Facts = Required<FileFacts>;
export type ResolveFileFacts = (
  ids: string[],
) => Promise<Record<string, Facts>>;

const BATCH = 100;

/**
 * What files are called and weigh now. A document keeps the facts a file
 * had when it was put in; a file renamed or replaced in its area since
 * reads differently, so cards ask here, one request for everything a page
 * shows at once, and fall back to what the document kept.
 */
class FactsStore {
  private readonly cache = new Map<string, Facts | null>();
  private readonly waiting = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private scheduled = false;

  constructor(private readonly resolve: ResolveFileFacts) {}

  get = (id: string) => this.cache.get(id) ?? undefined;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  request(id: string) {
    if (this.cache.has(id) || this.waiting.has(id)) return;
    this.waiting.add(id);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => void this.flush());
  }

  /** Asks again for files that changed, keeping their old facts meanwhile. */
  refresh(ids?: readonly string[]) {
    for (const id of ids ?? [...this.cache.keys()]) {
      if (!this.cache.has(id)) continue;
      this.waiting.add(id);
    }
    if (this.waiting.size === 0 || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => void this.flush());
  }

  private async flush() {
    this.scheduled = false;
    const ids = [...this.waiting];
    this.waiting.clear();
    for (let start = 0; start < ids.length; start += BATCH) {
      const batch = ids.slice(start, start + BATCH);
      const found = await this.resolve(batch).catch(() => null);
      for (const id of batch) this.cache.set(id, found?.[id] ?? null);
    }
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

const Context = createContext<FactsStore | null>(null);

export function FileFactsProvider({
  resolve,
  children,
}: {
  resolve: ResolveFileFacts;
  children: ReactNode;
}) {
  const [store] = useState(() => new FactsStore(resolve));
  return <Context value={store}>{children}</Context>;
}

const unsubscribed = () => () => undefined;

/** A file's current facts, or what the document kept until they arrive. */
export function useFileFacts<T extends FileFacts>(
  fileId: string | undefined,
  kept: T,
): T {
  const store = useContext(Context);
  const facts = useSyncExternalStore(
    store?.subscribe ?? unsubscribed,
    () => (store && fileId ? store.get(fileId) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (store && fileId) store.request(fileId);
  }, [store, fileId]);
  return facts ? { ...kept, ...facts } : kept;
}

/** Asks again for these files, or all, after they were renamed or replaced. */
export function useRefreshFileFacts(): (ids?: readonly string[]) => void {
  const store = useContext(Context);
  return (ids) => store?.refresh(ids);
}
