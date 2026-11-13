import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  inCallingOrder,
  saveEmergencyContactSchema,
} from "./emergency-contacts";

const PERSON = "0190a3c4-0000-7000-8000-000000000001";

describe("the order the school calls a person's emergency contacts", () => {
  it("goes by place, a marked contact before the person's own at one place, then as given", () => {
    const listed = inCallingOrder([
      { name: "Zaid", order: 2, own: true },
      { name: "Huda", order: 1, own: true },
      { name: "Mona", order: 1, own: false },
      { name: "Amal", order: 2, own: true },
      { name: "Omar", order: null, own: false },
      { name: "Sara", order: 99, own: false },
    ]);
    expect(listed.map((contact) => contact.name)).toEqual([
      "Mona",
      "Huda",
      "Zaid",
      "Amal",
      "Omar",
      "Sara",
    ]);
  });
});

describe("an emergency contact as saved", () => {
  const valid = {
    personId: PERSON,
    name: "Huda Saleh",
    phone: "0100 000 0003",
    callOrder: 1,
  };

  it("needs a name, a phone and a place in the order", () => {
    expect(v.safeParse(saveEmergencyContactSchema, valid).success).toBe(true);
    for (const missing of ["name", "phone"] as const)
      expect(
        v.safeParse(saveEmergencyContactSchema, { ...valid, [missing]: " " })
          .success,
      ).toBe(false);
    for (const callOrder of [0, 100, 1.5])
      expect(
        v.safeParse(saveEmergencyContactSchema, { ...valid, callOrder })
          .success,
      ).toBe(false);
  });

  it("keeps empty optional fields as nothing and refuses a malformed email", () => {
    const parsed = v.parse(saveEmergencyContactSchema, {
      ...valid,
      relationship: " ",
      email: "",
    });
    expect(parsed.relationship).toBeNull();
    expect(parsed.otherPhone).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(
      v.safeParse(saveEmergencyContactSchema, { ...valid, email: "huda@" })
        .success,
    ).toBe(false);
  });
});
