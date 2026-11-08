import { QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { createQueryClient } from "./queryClient";

/** A page watching one query, whose every refetch waits for `release`. */
async function watching() {
  const queryClient = createQueryClient();
  let fetches = 0;
  let release: (() => void) | undefined;
  const observer = new QueryObserver(queryClient, {
    queryKey: ["page"],
    queryFn: () => {
      fetches += 1;
      return fetches === 1
        ? Promise.resolve("first")
        : new Promise<string>((resolve) => {
            release = () => resolve("again");
          });
    },
  });
  const unwatch = observer.subscribe(() => {});
  await expect.poll(() => observer.getCurrentResult().data).toBe("first");
  const mutate = (meta?: Record<string, unknown>) =>
    queryClient
      .getMutationCache()
      .build(queryClient, { meta, mutationFn: () => Promise.resolve("done") })
      .execute(undefined);
  return {
    mutate,
    release: () => release?.(),
    refetching: () => queryClient.isFetching({ queryKey: ["page"] }) > 0,
    unwatch,
  };
}

describe("createQueryClient", () => {
  it("holds a mutation until the page it changed is fetched again", async () => {
    const page = await watching();
    let settled = false;
    const done = page.mutate().then(() => {
      settled = true;
    });
    await expect.poll(page.refetching).toBe(true);
    expect(settled).toBe(false);
    page.release();
    await done;
    expect(settled).toBe(true);
    page.unwatch();
  });

  it("ends a mutation that settles at once before the refetch", async () => {
    const page = await watching();
    await page.mutate({ settlesAtOnce: true });
    expect(page.refetching()).toBe(true);
    page.release();
    page.unwatch();
  });
});
