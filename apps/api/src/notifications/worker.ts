import type { ControlDatabase } from "@faridalms/database/control";

import { schools } from "@faridalms/database/control-schema";
import {
  claimPendingDeliveries,
  completeDelivery,
  failDelivery,
} from "@faridalms/database/repositories/notifications";
import { eq } from "drizzle-orm";

import type { TenantPools } from "../tenancy";
import type { Provider } from "./providers";

import { ProviderError } from "./providers";
import { renderNotification } from "./templates";

export interface WorkerProviders {
  email: Provider | null;
  sms: Provider | null;
}

/**
 * Drains each school's outbox in turn. Every delivery is claimed with a row
 * lock, so several API replicas can run the loop without sending twice, and
 * a provider failure only reschedules that one row.
 */
export class NotificationWorker {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private stopped = false;

  constructor(
    private readonly control: ControlDatabase,
    private readonly pools: TenantPools,
    private readonly providers: WorkerProviders,
    private readonly intervalMs: number,
    private readonly retryBaseMs: number,
  ) {}

  start() {
    this.schedule(this.intervalMs);
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    while (this.running)
      await new Promise((resolve) => setTimeout(resolve, 50));
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, delay);
  }

  async tick() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const active = await this.control
        .select()
        .from(schools)
        .where(eq(schools.isActive, true));
      for (const school of active) await this.drain(school);
    } catch (error) {
      console.error(
        JSON.stringify({
          worker: "notifications",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      this.running = false;
      this.schedule(this.intervalMs);
    }
  }

  async drain(school: typeof schools.$inferSelect) {
    const lease = await this.pools.acquire(school);
    try {
      for (let round = 0; round < 20; round += 1) {
        const handled = await lease.db.transaction(async (tx) => {
          const rows = await claimPendingDeliveries(tx, 25);
          for (const row of rows) {
            const notification = row.notification;
            const provider =
              row.channel === "email"
                ? this.providers.email
                : row.channel === "sms"
                  ? this.providers.sms
                  : null;
            if (!notification || !row.address) {
              await failDelivery(tx, row.id, row.attempts, "no_address", true);
              continue;
            }
            if (!provider) {
              await failDelivery(
                tx,
                row.id,
                row.attempts,
                "provider_not_configured",
                true,
              );
              continue;
            }
            const locale =
              notification.recipient?.notificationPreferences?.locale ?? "en";
            const rendered = renderNotification(
              locale,
              notification.type,
              notification.payload,
              school.name,
            );
            try {
              const result = await provider.send({
                to: row.address,
                subject: rendered.subject,
                text: rendered.text,
              });
              await completeDelivery(tx, row.id, result.receipt);
            } catch (error) {
              await failDelivery(
                tx,
                row.id,
                row.attempts,
                error instanceof Error ? error.message : String(error),
                error instanceof ProviderError && error.permanent,
                this.retryBaseMs,
              );
            }
          }
          return rows.length;
        });
        if (handled < 25) break;
      }
    } finally {
      lease.release();
    }
  }
}
