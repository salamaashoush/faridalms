import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code drawn as one SVG path, black on white whatever the theme, since
 * a camera reads dark modules on a light ground. Medium error correction
 * keeps the modules large enough for a phone held by a small child.
 */
export function QrCode({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const qr = useMemo(() => encode(value, { ecc: "M", border: 2 }), [value]);
  const path = useMemo(() => {
    let d = "";
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return d;
  }, [qr]);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
