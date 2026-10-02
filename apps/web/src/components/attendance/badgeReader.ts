import type { BarcodeDetector as Detector } from "barcode-detector/ponyfill";

import { BADGE_SECRET } from "@faridalms/domain/identity-schema";

let reader: Promise<Detector> | null = null;

/**
 * Something that reads QR codes from a camera frame: the browser's own
 * where it reads them (Chrome on Android and macOS), else ZXing built to
 * WebAssembly, as iPad Safari and desktop Chrome on Windows need. The
 * WebAssembly comes from the app, never a public CDN.
 */
export function qrReader(): Promise<Detector> {
  reader ??= (async () => {
    const native = (globalThis as { BarcodeDetector?: typeof Detector })
      .BarcodeDetector;
    if (native && (await native.getSupportedFormats()).includes("qr_code"))
      return new native({ formats: ["qr_code"] });
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasm }] =
      await Promise.all([
        import("barcode-detector/ponyfill"),
        import("zxing-wasm/reader/zxing_reader.wasm?url"),
      ]);
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? wasm : prefix + path,
      },
    });
    return new BarcodeDetector({ formats: ["qr_code"] });
  })();
  return reader;
}

/** The secret a badge carries, from the link printed on it, or none. */
export function badgeSecret(text: string): string | null {
  const hash = text.lastIndexOf("#");
  const secret = hash >= 0 ? text.slice(hash + 1) : text;
  return BADGE_SECRET.test(secret) ? secret : null;
}
