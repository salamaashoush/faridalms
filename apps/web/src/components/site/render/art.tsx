import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";

import { ratioStyle } from "./theme";

function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  // Murmur's finaliser, so seeds that differ by one character still land far apart.
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

/** A small deterministic generator, so a picture's artwork never changes between visits. */
function sequence(seed: string) {
  let state = hash(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/**
 * The art ramp the theme sets on the site's root: tones of the school's
 * main hue and its accent, so every composition is one family.
 */
const DEEP = "var(--s-art-deep)";
const BASE = "var(--s-art-base)";
const BRIGHT = "var(--s-art-bright)";
const LIGHT = "var(--s-art-light)";
const ACCENT = "var(--s-art-accent)";

type Draw = (next: () => number) => ReactNode;

/**
 * Compositions on a 400 by 300 field, each on a dark ground so words or a
 * scrim laid over them stay legible, and each using the accent only as a
 * crisp shape.
 */
const COMPOSITIONS: Draw[] = [
  // Arches standing on the ground, with a sun.
  (next) => {
    const sun = 250 + next() * 90;
    return (
      <>
        <rect width="400" height="300" fill={BASE} />
        <path d="M30 300V176a70 70 0 0 1 140 0V300Z" fill={DEEP} />
        <path d="M150 300V146a80 80 0 0 1 160 0V300Z" fill={BRIGHT} />
        <path d="M290 300V196a55 55 0 0 1 110 0V300Z" fill={DEEP} />
        <circle cx={sun} cy="70" r="26" fill={ACCENT} />
      </>
    );
  },
  // A low sun behind layered hills.
  (next) => {
    const x = 120 + next() * 160;
    return (
      <>
        <rect width="400" height="300" fill={DEEP} />
        <circle cx={x} cy="190" r="96" fill={ACCENT} />
        <path
          d="M0 210C90 170 170 230 250 200S370 160 400 176V300H0Z"
          fill={BASE}
        />
        <path
          d="M0 250C80 226 180 270 280 244S380 226 400 232V300H0Z"
          fill={BRIGHT}
        />
      </>
    );
  },
  // A Bauhaus grid of quarter and half circles.
  (next) => {
    const tiles: ReactNode[] = [];
    const fills = [BASE, BRIGHT, DEEP, LIGHT];
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 4; column++) {
        const x = column * 100;
        const y = row * 100;
        const turn = Math.floor(next() * 4) * 90;
        const fill = fills[Math.floor(next() * fills.length)] ?? BASE;
        const accent = next() > 0.86;
        tiles.push(
          <g
            key={`${row}-${column}`}
            transform={`rotate(${turn} ${x + 50} ${y + 50})`}
          >
            {next() > 0.5 ? (
              <path
                d={`M${x} ${y + 100}V${y}A100 100 0 0 1 ${x + 100} ${y + 100}Z`}
                fill={accent ? ACCENT : fill}
              />
            ) : (
              <path
                d={`M${x} ${y + 100}A50 50 0 0 1 ${x + 100} ${y + 100}Z`}
                fill={accent ? ACCENT : fill}
              />
            )}
          </g>,
        );
      }
    return (
      <>
        <rect width="400" height="300" fill={DEEP} />
        {tiles}
      </>
    );
  },
  // Broad diagonal bands with a ring.
  (next) => {
    const angle = -24 + next() * 10;
    return (
      <>
        <rect width="400" height="300" fill={DEEP} />
        <g transform={`rotate(${angle} 200 150)`}>
          <rect x="-120" y="40" width="640" height="70" fill={BASE} />
          <rect x="-120" y="130" width="640" height="70" fill={BRIGHT} />
          <rect x="-120" y="220" width="640" height="70" fill={BASE} />
        </g>
        <circle
          cx={300 - next() * 60}
          cy="84"
          r="34"
          fill="none"
          stroke={ACCENT}
          strokeWidth="14"
        />
      </>
    );
  },
  // Two leaves meeting, the theme's organic shape.
  (next) => {
    const lift = next() * 30;
    return (
      <>
        <rect width="400" height="300" fill={DEEP} />
        <path
          d={`M40 ${280 - lift}C40 150 120 60 250 60C250 190 170 ${280 - lift} 40 ${280 - lift}Z`}
          fill={BASE}
        />
        <path
          d="M200 300C200 200 270 130 380 130C380 230 310 300 200 300Z"
          fill={BRIGHT}
        />
        <circle cx="320" cy="64" r="18" fill={ACCENT} />
      </>
    );
  },
];

/**
 * Soft light in the school's own hue with a fine grain, for backdrops words
 * sit on; the accent is a crisp ring, never a blur, so it never muddies.
 */
function Mesh({ seed }: { seed: string }) {
  const next = sequence(`${seed}-mesh`);
  const id = `mesh-${hash(seed).toString(36)}`;
  const glows = [
    { colour: BRIGHT, r: 180, opacity: 0.9 },
    { colour: BASE, r: 220, opacity: 1 },
    { colour: BRIGHT, r: 120, opacity: 0.7 },
  ];
  const ring = { x: 300 + next() * 80, y: 40 + next() * 60 };
  return (
    <>
      <defs>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="60" />
        </filter>
        <filter id={`${id}-grain`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.35" stopColor={DEEP} stopOpacity="0" />
          <stop offset="1" stopColor={DEEP} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={DEEP} />
      <g filter={`url(#${id}-blur)`}>
        {glows.map((glow, index) => (
          <circle
            key={index}
            cx={60 + next() * 300}
            cy={20 + next() * 160}
            r={glow.r * (0.75 + next() * 0.4)}
            fill={glow.colour}
            opacity={glow.opacity}
          />
        ))}
      </g>
      <rect width="400" height="300" fill={`url(#${id}-floor)`} />
      <circle
        cx={ring.x}
        cy={ring.y}
        r="120"
        fill="none"
        stroke={ACCENT}
        strokeOpacity="0.85"
        strokeWidth="1.5"
      />
      <circle
        cx={ring.x}
        cy={ring.y}
        r="160"
        fill="none"
        stroke={LIGHT}
        strokeOpacity="0.18"
        strokeWidth="1"
      />
      <rect
        width="400"
        height="300"
        filter={`url(#${id}-grain)`}
        opacity="0.1"
      />
    </>
  );
}

/**
 * Artwork drawn from the theme's colours where a picture belongs but none
 * has been chosen yet, so a new site looks composed rather than broken.
 */
export function SiteArt({
  seed,
  className,
  ratio,
  kind = "shapes",
  phoneRatio,
}: {
  seed: string;
  className?: string;
  ratio?: string;
  kind?: "shapes" | "mesh";
  /** The proportions on a phone, where a tall picture would fill the screen. */
  phoneRatio?: string;
}) {
  const next = sequence(seed);
  const draw =
    COMPOSITIONS[Math.floor(next() * COMPOSITIONS.length)] ?? COMPOSITIONS[0];
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={cn("site-media block", className)}
      style={ratioStyle(ratio, phoneRatio)}
    >
      {kind === "mesh" ? <Mesh seed={seed} /> : draw?.(next)}
    </svg>
  );
}
