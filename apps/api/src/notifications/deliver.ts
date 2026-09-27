import type { Cell } from "@faridalms/database/context";
import type { DueDelivery } from "@faridalms/database/stores/notifications";

import {
  claimDue,
  settleDeliveries,
} from "@faridalms/database/stores/notifications";
import { retryDelayMs } from "@faridalms/domain/notifications";

import type { Provider } from "./providers";

import { ProviderError } from "./providers";
import { render } from "./templates";

export interface Gateways {
  email: Provider | null;
  sms: Provider | null;
}

function groups(rows: readonly DueDelivery[]): DueDelivery[][] {
  const out: DueDelivery[][] = [];
  const digests = new Map<string, DueDelivery[]>();
  for (const row of rows) {
    if (!row.digest) {
      out.push([row]);
      continue;
    }
    const key = `${row.userId}:${row.channel}:${row.address}`;
    const group = digests.get(key);
    if (group) group.push(row);
    else {
      const fresh = [row];
      digests.set(key, fresh);
      out.push(fresh);
    }
  }
  return out;
}

/**
 * One pass over a tenant's due deliveries as the worker. Rows are claimed with
 * a lock inside the unit, so two passes never send the same one; a person's
 * digest items leave as one message; a failed send is retried with backoff
 * until the attempts run out.
 */
export async function deliverTenant(
  cell: Cell,
  gateways: Gateways,
  tenantId: string,
  now: Date,
  limit = 200,
): Promise<{ sent: number; failed: number }> {
  return cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    async (tx) => {
      const due = await claimDue(tx, { tenantId, now, limit });
      let sent = 0;
      let failed = 0;
      for (const group of groups(due)) {
        const [head] = group;
        if (!head) continue;
        const provider = gateways[head.channel];
        const ids = group.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
        }));
        if (!provider) {
          await settleDeliveries(tx, {
            tenantId,
            ids,
            outcome: { state: "skipped", reason: "no_provider" },
          });
          continue;
        }
        const school =
          (head.locale === "ar" ? head.schoolNameAr : head.schoolNameEn) ??
          head.schoolNameEn ??
          "";
        const message = render({
          locale: head.locale,
          channel: head.channel,
          school,
          items: group.map((row) => ({ kind: row.kind, params: row.params })),
        });
        try {
          const result = await provider.send({ to: head.address, ...message });
          await settleDeliveries(tx, {
            tenantId,
            ids,
            outcome: { state: "sent", receipt: result.receipt },
          });
          sent += group.length;
        } catch (error) {
          const permanent = error instanceof ProviderError && error.permanent;
          const delay = retryDelayMs(head.attempts);
          await settleDeliveries(tx, {
            tenantId,
            ids,
            outcome: {
              state: "failed",
              error: error instanceof Error ? error.message : String(error),
              giveUp: permanent || delay === null,
              retryAt: delay === null ? null : new Date(now.getTime() + delay),
            },
          });
          failed += group.length;
        }
      }
      return { sent, failed };
    },
  );
}
