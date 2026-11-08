import type { ReactNode } from "react";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import type { FileFacts } from "./files";

type Facts = FileFacts & { bytes: number };
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

/** A file's current facts, once they have arrived. */
function useCurrentFacts(fileId: string | undefined): Facts | undefined {
  const store = useContext(Context);
  const facts = useSyncExternalStore(
    store?.subscribe ?? unsubscribed,
    () => (store && fileId ? store.get(fileId) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (store && fileId) store.request(fileId);
  }, [store, fileId]);
  return facts;
}

/** A file's current facts, or what the document kept until they arrive. */
export function useFileFacts<T extends FileFacts>(
  fileId: string | undefined,
  kept: T,
): T {
  const facts = useCurrentFacts(fileId);
  return facts ? { ...kept, ...facts } : kept;
}

/** Asks again for these files, or all, after they were renamed or replaced. */
export function useRefreshFileFacts(): (ids?: readonly string[]) => void {
  const store = useContext(Context);
  return (ids) => store?.refresh(ids);
}

/**
 * How a picture is drawn at the size a page needs: the `srcset` of its
 * sizes, or `<source>`s of them in modern formats, with its own size and a
 * placeholder to show while it loads, and where its subject sits.
 */
export interface PictureSource {
  srcSet?: string;
  sources?: readonly { type: string; srcSet: string }[];
  width?: number;
  height?: number;
  placeholder?: string;
  focus?: { x: number; y: number };
}

/** Where a host's pictures are fetched at each size; none fetches them whole. */
export type PictureSources = (fileId: string) => PictureSource | undefined;

const Sources = createContext<PictureSources | null>(null);

export const PictureSourcesProvider = Sources.Provider;

/**
 * Everything known of how to draw a picture: the host's sizes, and its
 * size, placeholder and subject from its current facts where the host
 * has not published them with the page.
 */
export function usePicture(fileId: string | undefined): PictureSource {
  const sources = useContext(Sources);
  const facts = useCurrentFacts(fileId);
  const given = fileId ? sources?.(fileId) : undefined;
  return {
    ...given,
    ...(facts?.width && facts.height
      ? { width: facts.width, height: facts.height }
      : {}),
    ...(facts?.placeholder ? { placeholder: facts.placeholder } : {}),
    ...(facts?.focus ? { focus: facts.focus } : {}),
  };
}
