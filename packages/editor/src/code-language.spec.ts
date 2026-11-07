import { CODE_LANGUAGE_FRIENDLY_NAME_MAP } from "@lexical/code-prism";
import { describe, expect, it } from "vitest";

import "./prism";
import {
  CODE_LANGUAGE_NAMES,
  codeGutter,
  codeLanguageName,
} from "./code-language";

describe("code languages", () => {
  it("names every language as Lexical does", () => {
    expect(CODE_LANGUAGE_NAMES).toEqual(CODE_LANGUAGE_FRIENDLY_NAME_MAP);
  });

  it("reads stored spellings and leaves plain text unnamed", () => {
    expect(codeLanguageName("python")).toBe("Python");
    expect(codeLanguageName("js")).toBe("JavaScript");
    expect(codeLanguageName("plaintext")).toBeNull();
    expect(codeLanguageName(null)).toBeNull();
    expect(codeLanguageName("constructor")).toBe("constructor");
  });

  it("numbers each line", () => {
    expect(codeGutter("a\nb\n")).toBe("1\n2\n3");
  });
});
