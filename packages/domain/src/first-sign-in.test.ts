import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  firstPassword,
  freeLoginName,
  loginNameChoices,
  loginNameSchema,
} from "./first-sign-in";

const nobody = {
  email: null,
  reference: null,
  givenNameEn: null,
  familyNameEn: null,
};

describe("a sign-in name", () => {
  it("is an email address or a short plain name, kept in lower case", () => {
    expect(v.parse(loginNameSchema, " Salama@Example.com ")).toBe(
      "salama@example.com",
    );
    expect(v.parse(loginNameSchema, "GA1008")).toBe("ga1008");
    expect(v.parse(loginNameSchema, "salama.ashoush2")).toBe("salama.ashoush2");
    for (const name of ["", "ab", "two words", ".salama", "salama.", "سلامة"])
      expect(v.is(loginNameSchema, name)).toBe(false);
  });

  it("is offered from a student's email, then their number, then their name", () => {
    expect(
      loginNameChoices({
        email: " Salama@Example.com",
        reference: "GA-1008",
        givenNameEn: "Salama",
        familyNameEn: "Ashoush",
      }),
    ).toEqual(["salama@example.com", "ga1008", "salama.ashoush"]);
  });

  it("drops marks from a name and passes over what is too short to type as one", () => {
    expect(
      loginNameChoices({
        ...nobody,
        reference: "7",
        givenNameEn: "Zoë",
        familyNameEn: "El-Sayed",
      }),
    ).toEqual(["zoe.elsayed"]);
    expect(loginNameChoices({ ...nobody, givenNameEn: "Salama" })).toEqual([
      "salama",
    ]);
  });

  it("is none for a student with no number and no name in Latin letters", () => {
    expect(loginNameChoices(nobody)).toEqual([]);
    expect(loginNameChoices({ ...nobody, email: "not an address" })).toEqual(
      [],
    );
  });

  it("goes to the first choice nobody holds", () => {
    const choices = ["salama@example.com", "ga1008", "salama.ashoush"];
    expect(freeLoginName(choices, new Set())).toBe("salama@example.com");
    expect(freeLoginName(choices, new Set(["salama@example.com"]))).toBe(
      "ga1008",
    );
  });

  it("numbers the last choice when every one is held", () => {
    expect(
      freeLoginName(
        ["ga1008", "salama.ashoush"],
        new Set(["ga1008", "salama.ashoush", "salama.ashoush2"]),
      ),
    ).toBe("salama.ashoush3");
    expect(freeLoginName([], new Set())).toBeNull();
    expect(
      freeLoginName(["salama@example.com"], new Set(["salama@example.com"])),
    ).toBeNull();
  });
});

/** Picks that run through a list of numbers, each kept under its bound. */
const picks = (numbers: number[]) => {
  let at = 0;
  return (bound: number) => {
    const next = numbers[at % numbers.length] ?? 0;
    at += 1;
    return next % bound;
  };
};

describe("a first password", () => {
  it("is four chunks of two syllables, long enough to be a password here", () => {
    const password = firstPassword(picks([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(password).toMatch(/^(?:[a-z]{4}-){3}[a-z]{4}$/);
    expect(password.length).toBeGreaterThanOrEqual(15);
    expect(password).toBe("befo-haki-befo-haki");
  });

  it("makes another chunk in place of one that reads as a rude word", () => {
    // k a k a, then k a k e for the first chunk.
    const password = firstPassword(
      picks([6, 0, 6, 0, 6, 0, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    );
    expect(password.startsWith("kake-")).toBe(true);
    expect(password).not.toContain("kaka");
  });
});
