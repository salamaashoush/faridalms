import { CORE_SYSTEMS, moduleOfSystem } from "@faridalms/domain/modules";
import { DecoratedProcedure } from "@orpc/server";
import { describe, expect, it } from "bun:test";

import { router } from "../src/router";

/** Every namespace, a nested one as `outer.inner`. */
const namespaces = Object.entries(router).flatMap(([name, value]) =>
  Object.values(value).some((entry) => entry instanceof DecoratedProcedure)
    ? [name]
    : Object.keys(value).map((part) => `${name}.${part}`),
);

describe("the router", () => {
  it("gives every namespace an owner: core, or the module that answers it", () => {
    const core = new Set<string>(CORE_SYSTEMS);
    const unowned = namespaces.filter(
      (system) => !core.has(system) && moduleOfSystem(system) === null,
    );
    expect(unowned).toEqual([]);
  });

  it("gives no namespace two owners", () => {
    expect(
      namespaces.filter(
        (system) =>
          (CORE_SYSTEMS as readonly string[]).includes(system) &&
          moduleOfSystem(system) !== null,
      ),
    ).toEqual([]);
  });

  it("keeps announcements and news under the one broadcasts namespace", () => {
    expect(namespaces).toContain("broadcasts.announcements");
    expect(namespaces).toContain("broadcasts.news");
    expect(namespaces).not.toContain("announcements");
    expect(namespaces).not.toContain("news");
  });
});
