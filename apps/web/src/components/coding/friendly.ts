import * as m from "~/i18n/messages";

import type { RunLanguage } from "./runner/runner";

/**
 * What an error means, in the student's own language, for the errors
 * beginners meet most. Python's and JavaScript's TypeError mean different
 * things, so each language reads its own; an error with no entry says
 * nothing more than its own message.
 */
export function friendlyError(
  language: RunLanguage,
  name: string,
): string | null {
  if (language === "javascript")
    switch (name) {
      case "ReferenceError":
        return m.codeWhyName();
      case "SyntaxError":
        return m.codeWhySyntaxJs();
      case "TypeError":
        return m.codeWhyTypeJs();
      case "RangeError":
        return m.codeWhyRange();
      default:
        return null;
    }
  switch (name) {
    case "SyntaxError":
      return m.codeWhySyntax();
    case "IndentationError":
    case "TabError":
      return m.codeWhyIndent();
    case "NameError":
    case "UnboundLocalError":
      return m.codeWhyName();
    case "TypeError":
      return m.codeWhyType();
    case "ValueError":
      return m.codeWhyValue();
    case "ZeroDivisionError":
      return m.codeWhyZero();
    case "IndexError":
      return m.codeWhyIndex();
    case "KeyError":
      return m.codeWhyKey();
    case "AttributeError":
      return m.codeWhyAttribute();
    case "RecursionError":
      return m.codeWhyRecursion();
    case "ModuleNotFoundError":
    case "ImportError":
      return m.codeWhyModule();
    default:
      return null;
  }
}
