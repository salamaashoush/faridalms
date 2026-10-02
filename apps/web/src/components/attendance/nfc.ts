import { badgeSecret } from "./badgeReader";

// Web NFC exists only in Chrome on Android, so its types are not in the DOM
// library; these are the parts used.
interface NdefRecord {
  recordType: string;
  encoding?: string;
  data?: DataView;
}
interface NdefReadingEvent extends Event {
  message: { records: NdefRecord[] };
}
interface NdefReader extends EventTarget {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  write: (message: {
    records: { recordType: "url"; data: string }[];
  }) => Promise<void>;
}

const Reader = () =>
  (globalThis as { NDEFReader?: new () => NdefReader }).NDEFReader;

/** Whether this device reads and writes cards: Chrome on Android. */
export const nfcAvailable = () => Reader() !== undefined;

/** Writes a badge's link to a card or sticker held to the device. */
export async function writeBadgeCard(url: string): Promise<void> {
  const NDEFReader = Reader();
  if (!NDEFReader) throw new Error("nfc.unavailable");
  await new NDEFReader().write({ records: [{ recordType: "url", data: url }] });
}

/**
 * Reads cards held to the device until `signal` aborts, handing on each
 * badge's secret. A card's own serial number is never used: it can be read
 * and copied by anyone, so only the badge's secret names a child.
 */
export async function readBadgeCards(
  onSecret: (secret: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const NDEFReader = Reader();
  if (!NDEFReader) throw new Error("nfc.unavailable");
  const reader = new NDEFReader();
  reader.addEventListener("reading", (event) => {
    for (const record of (event as NdefReadingEvent).message.records) {
      if (!record.data) continue;
      const text = new TextDecoder(record.encoding ?? "utf-8").decode(
        record.data,
      );
      const secret = badgeSecret(text);
      if (secret) onSecret(secret);
    }
  });
  await reader.scan({ signal });
}
