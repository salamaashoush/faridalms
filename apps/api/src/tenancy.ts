import type { Database } from "@faridalms/database";

import { createDatabase } from "@faridalms/database";
import { ORPCError } from "@orpc/server";

interface Pool {
  db: Database;
  leases: number;
  lastUsed: number;
}

export class TenantPools {
  private readonly pools = new Map<string, Pool>();

  constructor(
    private readonly capacity: number,
    private readonly connections: number,
  ) {}

  async acquire(school: {
    id: string;
    databaseUrl: string;
  }): Promise<{ db: Database; release: () => void }> {
    let pool = this.pools.get(school.id);
    if (!pool) {
      if (this.pools.size >= this.capacity) {
        const oldest = [...this.pools.entries()]
          .filter(([, entry]) => entry.leases === 0)
          .toSorted((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
        if (!oldest) throw new ORPCError("SERVICE_UNAVAILABLE");
        this.pools.delete(oldest[0]);
        await oldest[1].db.$client.close();
        return this.acquire(school);
      }
      pool = {
        db: createDatabase(school.databaseUrl, this.connections),
        leases: 0,
        lastUsed: Date.now(),
      };
      this.pools.set(school.id, pool);
    }
    pool.leases += 1;
    const leased = pool;
    return {
      db: leased.db,
      release: () => {
        leased.leases -= 1;
        leased.lastUsed = Date.now();
      },
    };
  }

  async close() {
    await Promise.all(
      [...this.pools.values()].map((pool) => pool.db.$client.close()),
    );
  }
}
