import { afterAll } from "bun:test";

import { setUp, tearDown } from "./harness";

await setUp();

afterAll(async () => {
  await tearDown();
});
