import type { Cell } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";

import type { Gateways } from "./deliver";

import { deliverTenant } from "./deliver";

/**
 * Sends what is due, tenant by tenant, on a timer. Each pass waits for the
 * previous one, and one tenant's failure is logged without stopping the rest.
 */
export function startDelivery(input: {
  cell: Cell;
  directory: Directory;
  cellId: string;
  gateways: Gateways;
  intervalMs: number;
}): () => Promise<void> {
  let stopped = false;
  let running: Promise<void> | null = null;
  const pass = async () => {
    const tenants = await input.directory.tenantsOfCell(input.cellId);
    for (const tenantId of tenants) {
      if (stopped) return;
      try {
        await deliverTenant(input.cell, input.gateways, tenantId);
      } catch (error) {
        console.error(
          JSON.stringify({
            worker: "notifications",
            tenantId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  };
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = pass()
      .catch((error: unknown) =>
        console.error(
          JSON.stringify({ worker: "notifications", error: String(error) }),
        ),
      )
      .finally(() => {
        running = null;
      });
  }, input.intervalMs);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
