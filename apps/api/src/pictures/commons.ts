import type { CommonsPicture } from "@faridalms/domain/commons";

import { commonsResults, commonsSearchUrl } from "@faridalms/domain/commons";

/** How many pictures one search asks Commons for. */
const RESULTS = 30;
/**
 * The gap kept between two requests from this process. Requests go one at
 * a time, as Wikimedia asks of clients; a client naming itself may make
 * 200 a minute, and this stays well under that.
 */
const GAP_MS = 400;
/** How long to wait after Commons says it is busy without saying for how long. */
const BUSY_MS = 5000;
const TIMEOUT_MS = 8000;
const CACHE_MS = 10 * 60_000;
const CACHE_ENTRIES = 200;

export class CommonsBusy extends Error {
  constructor() {
    super("pictures.commons_busy");
  }
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The User-Agent Wikimedia asks every client for: what is asking, and a
 * way to reach whoever runs it, which here is the deployment's own site.
 */
export const commonsUserAgent = (site: string) =>
  `FaridaLMS/1.0 (${site}; picture search for school staff)`;

/** Seconds or a date, as Retry-After says it, in milliseconds from now. */
function retryAfter(value: string | null, now: number): number {
  if (!value) return BUSY_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1000, BUSY_MS);
  const at = Date.parse(value);
  return Number.isNaN(at) ? BUSY_MS : Math.max(at - now, BUSY_MS);
}

/**
 * Searches Wikimedia Commons from the server, one request at a time with a
 * gap between them, holding off for as long as Commons asks when it says it
 * is busy, and keeping recent answers so a search typed again asks nothing.
 */
export type CommonsSearch = (
  words: string,
  language: string,
) => Promise<CommonsPicture[]>;

export function commonsSearcher(
  site: string,
  fetcher: Fetcher = fetch,
): CommonsSearch {
  const userAgent = commonsUserAgent(site);
  const kept = new Map<string, { at: number; pictures: CommonsPicture[] }>();
  let queue: Promise<unknown> = Promise.resolve();
  let nextAt = 0;
  let busyUntil = 0;

  const ask = async (url: string): Promise<unknown> => {
    const wait = nextAt - Date.now();
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    if (Date.now() < busyUntil) throw new CommonsBusy();
    try {
      const response = await fetcher(url, {
        headers: { "user-agent": userAgent, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 429 || response.status === 503) {
        busyUntil =
          Date.now() +
          retryAfter(response.headers.get("retry-after"), Date.now());
        throw new CommonsBusy();
      }
      if (!response.ok) throw new CommonsBusy();
      return await response.json();
    } finally {
      nextAt = Date.now() + GAP_MS;
    }
  };

  return async (words: string, language: string) => {
    const key = `${language}\u0000${words.toLocaleLowerCase()}`;
    const known = kept.get(key);
    if (known && Date.now() - known.at < CACHE_MS) return known.pictures;
    if (Date.now() < busyUntil) throw new CommonsBusy();
    const asked = queue.then(() =>
      ask(commonsSearchUrl(words, language, RESULTS)),
    );
    queue = asked.catch(() => undefined);
    const pictures = commonsResults(await asked, language);
    kept.delete(key);
    kept.set(key, { at: Date.now(), pictures });
    for (const oldest of kept.keys()) {
      if (kept.size <= CACHE_ENTRIES) break;
      kept.delete(oldest);
    }
    return pictures;
  };
}
