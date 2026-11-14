import { afterAll, afterEach } from "bun:test";

import { requireSeedMarks, setUp, tearDown } from "./harness";

await setUp();

afterEach(async () => {
  await requireSeedMarks();
});

afterAll(async () => {
  await tearDown();
});
