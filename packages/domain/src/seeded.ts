/**
 * Numbers from 0 up to 1 that come out the same for the same seed, so a
 * shuffle or a puzzle made for one student, or one class, is made the same
 * way again on every reload and on paper.
 */
export function seededRandom(seed: string): () => number {
  let state = 0;
  for (const char of seed)
    state = (Math.imul(state, 31) + char.charCodeAt(0)) | 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9) | 0;
    return ((state >>> 0) % 100000) / 100000;
  };
}
