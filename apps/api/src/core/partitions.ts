import type { Cell } from "@faridalms/database/context";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_AHEAD = 3;

/**
 * Keeps the cell's partitioned tables a few months ahead of the clock: once
 * at start and then daily. A pass that fails is logged and tried again the
 * next day, which leaves months of room.
 */
export function startPartitionUpkeep(
  cell: Cell,
  intervalMs = DAY_MS,
): () => Promise<void> {
  let running: Promise<void> | null = null;
  const pass = () => {
    if (running) return;
    running = cell
      .ensurePartitions(MONTHS_AHEAD)
      .then(
        (made) => {
          if (made > 0)
            console.info(JSON.stringify({ worker: "partitions", made }));
        },
        (error: unknown) =>
          console.error(
            JSON.stringify({
              worker: "partitions",
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
      )
      .finally(() => {
        running = null;
      });
  };
  pass();
  const timer = setInterval(pass, intervalMs);
  return async () => {
    clearInterval(timer);
    await running;
  };
}
