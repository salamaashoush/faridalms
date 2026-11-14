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

interface MeshProps {
  seed: string;
}

/** How far a glow's light spreads past its edge, in the field's units. */
const SPREAD = 60;

/** The error function, to within 1.5e-7 (Abramowitz and Stegun 7.1.26). */
function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    t *
      (0.254829592 +
        t *
          (-0.284496736 +
            t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
      Math.exp(-x * x);
  return x < 0 ? -y : y;
}

/**
 * The stops of a disc of light softened by a Gaussian of SPREAD: full in
 * its middle, half at its edge and gone three spreads past it, which is
 * what a blur filter would draw, without the filter's cost on every frame.
 */
function glowStops(radius: number, opacity: number) {
  const outer = radius + 3 * SPREAD;
  const stops = [0, 0.15, 0.3, 0.45, 0.6, 0.7, 0.8, 0.88, 0.94, 1];
  return stops.map((offset) => {
    const distance = (offset * outer - radius) / SPREAD;
    return {
      offset,
      opacity: opacity * 0.5 * (1 - erf(distance / Math.SQRT2)),
    };
  });
}

/**
 * A fine grain, one small noise tile repeated: an image the browser decodes
 * once, where a turbulence filter would be worked out again on every frame.
 */
const GRAIN =
  "data:image/png;base64,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";
const GRAIN_TILE = 32;

/**
 * Soft light in the school's own hue with a fine grain, for backdrops words
 * sit on; the accent is a crisp ring, never a blur, so it never muddies.
 */
function Mesh({ seed }: MeshProps) {
  const next = sequence(`${seed}-mesh`);
  const id = `mesh-${hash(seed).toString(36)}`;
  const ring = { x: 300 + next() * 80, y: 40 + next() * 60 };
  const glows = (
    [
      ["wide", BRIGHT, 180, 0.9],
      ["base", BASE, 220, 1],
      ["small", BRIGHT, 120, 0.7],
    ] as const
  ).map(([key, colour, r, opacity]) => ({
    id: key,
    colour,
    opacity,
    cx: 60 + next() * 300,
    cy: 20 + next() * 160,
    r: r * (0.75 + next() * 0.4),
  }));
  return (
    <>
      <defs>
        {glows.map((glow) => (
          <radialGradient
            key={glow.id}
            id={`${id}-${glow.id}`}
            gradientUnits="userSpaceOnUse"
            cx={glow.cx}
            cy={glow.cy}
            r={glow.r + 3 * SPREAD}
          >
            {glowStops(glow.r, glow.opacity).map((stop) => (
              <stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={glow.colour}
                stopOpacity={stop.opacity}
              />
            ))}
          </radialGradient>
        ))}
        <pattern
          id={`${id}-grain`}
          width={GRAIN_TILE}
          height={GRAIN_TILE}
          patternUnits="userSpaceOnUse"
        >
          <image href={GRAIN} width={GRAIN_TILE} height={GRAIN_TILE} />
        </pattern>
        <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.35" stopColor={DEEP} stopOpacity="0" />
          <stop offset="1" stopColor={DEEP} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={DEEP} />
      {glows.map((glow) => (
        <rect
          key={glow.id}
          width="400"
          height="300"
          fill={`url(#${id}-${glow.id})`}
        />
      ))}
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
        fill={`url(#${id}-grain)`}
        opacity="0.08"
      />
    </>
  );
}

/**
 * Where a picture sits among siblings (the tiles of one section), so
 * neighbours never draw the same composition by chance.
 */
export interface ArtSet {
  id: string;
  index: number;
}

export interface SiteArtProps {
  seed: string;
  className?: string;
  ratio?: string;
  kind?: "shapes" | "mesh";
  /** The proportions on a phone, where a tall picture would fill the screen. */
  phoneRatio?: string;
  set?: ArtSet;
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
  set,
}: SiteArtProps) {
  const next = sequence(seed);
  const pick = Math.floor(next() * COMPOSITIONS.length);
  const draw =
    COMPOSITIONS[
      set ? (hash(set.id) + set.index) % COMPOSITIONS.length : pick
    ] ?? COMPOSITIONS[0];
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
