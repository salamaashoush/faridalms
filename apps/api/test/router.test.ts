import { CORE_SYSTEMS, moduleOfSystem } from "@faridalms/domain/modules";
import { describe, expect, it } from "bun:test";

import { router } from "../src/router";

describe("the router", () => {
  it("gives every namespace an owner: core, or the module that answers it", () => {
    const core = new Set<string>(CORE_SYSTEMS);
    const unowned = Object.keys(router).filter(
      (system) => !core.has(system) && moduleOfSystem(system) === null,
    );
    expect(unowned).toEqual([]);
  });

  it("gives no namespace two owners", () => {
    expect(
      Object.keys(router).filter(
        (system) =>
          (CORE_SYSTEMS as readonly string[]).includes(system) &&
          moduleOfSystem(system) !== null,
      ),
    ).toEqual([]);
  });
});
