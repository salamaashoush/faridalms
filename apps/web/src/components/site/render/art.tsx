import type { ReactNode } from "react";

import { cn } from "~/utils/cn";

import { ratioStyle } from "./theme";

function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
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

const COLOURS = [
  "var(--s-primary)",
  "var(--s-accent)",
  "var(--s-surface)",
  "var(--s-canvas)",
  "var(--s-ink)",
] as const;

type Draw = (
  next: () => number,
  pick: (from: readonly string[]) => string,
) => ReactNode;

const COMPOSITIONS: Draw[] = [
  (next, pick) => {
    const [a, b] = [pick(COLOURS.slice(0, 2)), pick(COLOURS.slice(0, 2))];
    return (
      <>
        <rect width="400" height="300" fill="var(--s-surface)" />
        <path d="M40 300 V170 a80 80 0 0 1 160 0 V300 Z" fill={a} />
        <path
          d="M220 300 V130 a70 70 0 0 1 140 0 V300 Z"
          fill={b === a ? "var(--s-accent)" : b}
          opacity="0.9"
        />
        <circle
          cx={300 - next() * 80}
          cy={60 + next() * 20}
          r="26"
          fill="var(--s-canvas)"
        />
      </>
    );
  },
  (next) => (
    <>
      <rect width="400" height="300" fill="var(--s-primary)" />
      <circle
        cx={260 + next() * 60}
        cy={170}
        r="150"
        fill="var(--s-accent)"
        opacity="0.85"
      />
      <circle cx={90} cy={90 + next() * 40} r="46" fill="var(--s-canvas)" />
      <g fill="var(--s-canvas)" opacity="0.35">
        {Array.from({ length: 30 }, (_, index) => (
          <circle
            key={index}
            cx={30 + (index % 6) * 22}
            cy={190 + Math.floor(index / 6) * 20}
            r="3"
          />
        ))}
      </g>
    </>
  ),
  (next, pick) => (
    <>
      <rect width="400" height="300" fill="var(--s-canvas)" />
      {[0, 1, 2, 3].map((index) => (
        <path
          key={index}
          d={`M${index * 100} 300 A100 100 0 0 1 ${index * 100 + 100} 200 L${index * 100 + 100} 300 Z`}
          transform={
            index % 2
              ? `rotate(${next() > 0.5 ? 0 : 90} ${index * 100 + 50} 250)`
              : undefined
          }
          fill={pick(COLOURS.slice(0, 3))}
        />
      ))}
      {[0, 1, 2, 3].map((index) => (
        <circle
          key={index}
          cx={index * 100 + 50}
          cy="110"
          r={20 + next() * 30}
          fill={pick([
            "var(--s-primary)",
            "var(--s-accent)",
            "var(--s-surface)",
          ])}
        />
      ))}
    </>
  ),
  () => (
    <>
      <rect width="400" height="300" fill="var(--s-surface)" />
      <path
        d="M0 210 C80 170 140 250 220 210 S340 160 400 190 V300 H0 Z"
        fill="var(--s-primary)"
      />
      <path
        d="M0 250 C90 220 170 290 260 250 S360 220 400 240 V300 H0 Z"
        fill="var(--s-accent)"
      />
      <circle cx="300" cy="90" r="40" fill="var(--s-accent)" opacity="0.8" />
    </>
  ),
  (next) => (
    <>
      <rect width="400" height="300" fill="var(--s-ink)" />
      <g transform={`rotate(${-20 + next() * 10} 200 150)`}>
        <rect x="-60" y="60" width="520" height="46" fill="var(--s-primary)" />
        <rect x="-60" y="130" width="520" height="46" fill="var(--s-accent)" />
        <rect
          x="-60"
          y="200"
          width="520"
          height="46"
          fill="var(--s-surface)"
          opacity="0.9"
        />
      </g>
    </>
  ),
];

/** Soft light from the palette with a fine grain, for backdrops words sit on. */
function Mesh({ seed }: { seed: string }) {
  const next = sequence(`${seed}-mesh`);
  const id = `mesh-${hash(seed).toString(36)}`;
  const glows = [
    { colour: "var(--s-accent)", r: 170 },
    { colour: "var(--s-primary)", r: 210 },
    { colour: "var(--s-surface)", r: 120 },
    { colour: "var(--s-accent)", r: 110 },
  ];
  return (
    <>
      <defs>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="55" />
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
      </defs>
      <rect width="400" height="300" fill="var(--s-ink)" />
      <g filter={`url(#${id}-blur)`} opacity="0.95">
        {glows.map((glow) => (
          <circle
            key={`${glow.colour}-${glow.r}`}
            cx={40 + next() * 320}
            cy={30 + next() * 240}
            r={glow.r * (0.7 + next() * 0.5)}
            fill={glow.colour}
          />
        ))}
      </g>
      <rect
        width="400"
        height="300"
        filter={`url(#${id}-grain)`}
        opacity="0.12"
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
  if (kind === "mesh")
    return (
      <svg
        aria-hidden
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
        className={cn("site-media block", className)}
        style={ratioStyle(ratio, phoneRatio)}
      >
        <Mesh seed={seed} />
      </svg>
    );
  const next = sequence(seed);
  const pick = (from: readonly string[]) =>
    from[Math.floor(next() * from.length)] ?? from[0] ?? "var(--s-primary)";
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
      {draw?.(next, pick)}
    </svg>
  );
}
