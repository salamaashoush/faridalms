/** How far a pixel's colour may stray from the one tapped and still be filled. */
const TOLERANCE = 96;

/**
 * The pixels a tap fills on a picture: the area of like colour around the
 * tapped point, bounded by the picture's lines and the child's own strokes,
 * as a colouring book's paint bucket fills a shape. The area grows by a
 * pixel all round, so the soft edge of a drawn line keeps no pale rim.
 */
export function fillMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const column = Math.floor(x);
  const row = Math.floor(y);
  if (column < 0 || row < 0 || column >= width || row >= height) return mask;
  const seed = (row * width + column) * 4;
  const red = pixels[seed] ?? 0;
  const green = pixels[seed + 1] ?? 0;
  const blue = pixels[seed + 2] ?? 0;
  const like = (index: number) => {
    const at = index * 4;
    return (
      Math.abs((pixels[at] ?? 0) - red) +
        Math.abs((pixels[at + 1] ?? 0) - green) +
        Math.abs((pixels[at + 2] ?? 0) - blue) <=
      TOLERANCE
    );
  };
  // Scanline filling: each run across is filled at once, and the rows
  // above and below it are looked at for runs still to fill, one seed each.
  const pending: number[] = [row * width + column];
  while (pending.length > 0) {
    const start = pending.pop() ?? 0;
    if (mask[start]) continue;
    const line = Math.floor(start / width);
    let left = start;
    while (left % width > 0 && !mask[left - 1] && like(left - 1)) left -= 1;
    let right = start;
    while (right % width < width - 1 && !mask[right + 1] && like(right + 1))
      right += 1;
    mask.fill(1, left, right + 1);
    for (const step of [-1, 1]) {
      const next = line + step;
      if (next < 0 || next >= height) continue;
      let seeded = false;
      for (let index = left; index <= right; index += 1) {
        const below = index + step * width;
        if (!mask[below] && like(below)) {
          if (!seeded) pending.push(below);
          seeded = true;
        } else seeded = false;
      }
    }
  }
  const grown = new Uint8Array(mask);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const across = index % width;
    if (across > 0) grown[index - 1] = 1;
    if (across < width - 1) grown[index + 1] = 1;
    if (index >= width) grown[index - width] = 1;
    if (index + width < mask.length) grown[index + width] = 1;
  }
  return grown;
}

/** How far from the tap the farthest pixel a fill colours lies. */
export function reachOf(
  mask: Uint8Array,
  width: number,
  x: number,
  y: number,
): number {
  let farthest = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const across = (index % width) - x;
    const down = Math.floor(index / width) - y;
    farthest = Math.max(farthest, across * across + down * down);
  }
  return Math.sqrt(farthest);
}

// Paint spreads at about a screen's width a second, however small the
// area, so a big one never keeps a child waiting and a small one is seen.
const SPREAD_SPEED = 1.2;
const SPREAD_SHORTEST = 300;
const SPREAD_LONGEST = 900;

/** How long a fill takes to spread to every part of its area, in milliseconds. */
export const spreadTime = (reach: number) =>
  Math.min(SPREAD_LONGEST, Math.max(SPREAD_SHORTEST, reach / SPREAD_SPEED));

/**
 * How far a fill has spread from the tap a while after it, quick at first
 * and slowing as it reaches the edges, as poured paint does.
 */
export function spreadRadius(elapsed: number, reach: number): number {
  const done = Math.min(1, Math.max(0, elapsed / spreadTime(reach)));
  return reach * (1 - (1 - done) ** 2);
}
