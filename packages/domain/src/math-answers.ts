/**
 * Whether two pieces of mathematics written in LaTeX are the same, as a
 * mathematics teacher means it: `2(x+1)` is `2x+2`, `\frac{1}{2}` is `0.5`.
 * Each side is read as an expression and worked out at the same sample
 * values of its letters, as WeBWorK marks; two expressions that agree at
 * every sample, positive and negative, are the same. The samples come from
 * the letters themselves, so a mark never changes from one run to the next.
 *
 * It reads the LaTeX that MathLive writes: numbers (Arabic-Indic digits
 * too), Latin and Arabic letters with subscripts, Greek letters, + − × ÷ · and juxtaposition,
 * powers, \frac, \sqrt, |…|, brackets, \pi, and the usual functions. What it
 * cannot read gives no answer, and the caller compares the writing instead.
 */

export type Expr =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "neg"; arg: Expr }
  | {
      kind: "op";
      op: "+" | "-" | "*" | "/" | "^";
      left: Expr;
      right: Expr;
      /** A whole number and a fraction written side by side, as 2⅓ is. */
      mixed?: true;
    }
  | { kind: "fn"; name: string; arg: Expr; base?: Expr };

type Token =
  | { kind: "num"; text: string }
  | { kind: "letter"; name: string }
  | { kind: "command"; name: string }
  | { kind: "char"; value: string };

const SPACES = new Set([
  ",",
  ";",
  ":",
  "!",
  " ",
  "quad",
  "qquad",
  "displaystyle",
  "textstyle",
  "left",
  "right",
  "bigl",
  "bigr",
  "Bigl",
  "Bigr",
  "big",
  "Big",
]);

const GREEK = new Set([
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "varepsilon",
  "zeta",
  "eta",
  "theta",
  "vartheta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "rho",
  "sigma",
  "tau",
  "upsilon",
  "phi",
  "varphi",
  "chi",
  "psi",
  "omega",
  "Gamma",
  "Delta",
  "Theta",
  "Lambda",
  "Xi",
  "Sigma",
  "Phi",
  "Psi",
  "Omega",
]);

const FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "sec",
  "csc",
  "cot",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "ln",
  "log",
  "exp",
]);

const ARABIC_DIGITS = /[٠-٩۰-۹]/gu;

function westernDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function tokenize(latex: string): Token[] | null {
  const text = westernDigits(latex)
    // A decimal comma, as LaTeX and Arabic write it, is a point.
    .replace(/(\d)(?:\{,\}|٫)(\d)/gu, "$1.$2");
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const character = text[at] ?? "";
    if (/\s/u.test(character) || character === "~") {
      at += 1;
      continue;
    }
    if (/[\d.]/u.test(character)) {
      const number = /^\d*\.?\d+|^\d+\.?/u.exec(text.slice(at))?.[0] ?? "";
      if (!number) return null;
      tokens.push({ kind: "num", text: number });
      at += number.length;
      continue;
    }
    if (character === "\\") {
      const name = /^\\([A-Za-z]+|.)/u.exec(text.slice(at))?.[1] ?? "";
      if (!name) return null;
      at += name.length + 1;
      if (SPACES.has(name)) continue;
      if (name === "{" || name === "}") {
        tokens.push({ kind: "char", value: name === "{" ? "(" : ")" });
        continue;
      }
      if (["|", "vert", "lvert", "rvert", "mid"].includes(name)) {
        tokens.push({ kind: "char", value: "|" });
        continue;
      }
      if (name === "lparen" || name === "lbrack") {
        tokens.push({ kind: "char", value: "(" });
        continue;
      }
      if (name === "rparen" || name === "rbrack") {
        tokens.push({ kind: "char", value: ")" });
        continue;
      }
      if (name === "mathrm" || name === "operatorname" || name === "text") {
        // \mathrm{e} is Euler's number; \operatorname{sin} a function.
        const word = /^\s*\{([A-Za-z]+)\}/u.exec(text.slice(at));
        if (!word?.[1]) return null;
        at += word[0].length;
        if (word[1] === "e") tokens.push({ kind: "command", name: "e" });
        else if (FUNCTIONS.has(word[1]))
          tokens.push({ kind: "command", name: word[1] });
        else return null;
        continue;
      }
      tokens.push({ kind: "command", name });
      continue;
    }
    // Arabic school mathematics names its unknowns with letters such as س and ص.
    if (/[A-Za-z\u0621-\u064A]/u.test(character)) {
      tokens.push({ kind: "letter", name: character });
      at += 1;
      continue;
    }
    if ("+-*/^_()[]{}|=".includes(character)) {
      tokens.push({ kind: "char", value: character });
      at += 1;
      continue;
    }
    if (character === "−") {
      tokens.push({ kind: "char", value: "-" });
      at += 1;
      continue;
    }
    if (character === "×" || character === "·") {
      tokens.push({ kind: "command", name: "cdot" });
      at += 1;
      continue;
    }
    if (character === "÷") {
      tokens.push({ kind: "command", name: "div" });
      at += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

class Reader {
  at = 0;
  /** How many |…| the reader is inside, where a bar closes rather than opens. */
  bars = 0;
  constructor(readonly tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.at];
  }

  next(): Token | undefined {
    const token = this.tokens[this.at];
    this.at += 1;
    return token;
  }

  isChar(value: string): boolean {
    const token = this.peek();
    return token?.kind === "char" && token.value === value;
  }

  isCommand(...names: string[]): boolean {
    const token = this.peek();
    return token?.kind === "command" && names.includes(token.name);
  }

  expect(value: string) {
    if (!this.isChar(value)) throw new Error("unreadable");
    this.at += 1;
  }

  done(): boolean {
    return this.at >= this.tokens.length;
  }
}

function sum(reader: Reader): Expr {
  let left = term(reader);
  for (;;) {
    if (reader.isChar("+") || reader.isChar("-")) {
      const token = reader.next();
      const op = token?.kind === "char" && token.value === "+" ? "+" : "-";
      left = { kind: "op", op, left, right: term(reader) };
    } else if (reader.isCommand("pm", "mp")) throw new Error("unreadable");
    else return left;
  }
}

/** Whether what comes next starts a factor, which then multiplies. */
function startsFactor(reader: Reader): boolean {
  const token = reader.peek();
  if (!token) return false;
  if (token.kind === "num" || token.kind === "letter") return true;
  if (token.kind === "char")
    return (
      token.value === "(" ||
      token.value === "[" ||
      (token.value === "|" && reader.bars === 0)
    );
  return (
    ["frac", "dfrac", "tfrac", "sqrt", "pi", "e"].includes(token.name) ||
    GREEK.has(token.name) ||
    FUNCTIONS.has(token.name)
  );
}

const wholeNumber = (expr: Expr) =>
  expr.kind === "num" && Number.isInteger(expr.value);

function term(reader: Reader): Expr {
  let left = unary(reader);
  // 2\frac{1}{3} is two and a third at school, not two thirds.
  const whole = left.kind === "neg" ? left.arg : left;
  if (wholeNumber(whole) && reader.isCommand("frac", "dfrac", "tfrac")) {
    const fraction = power(reader);
    if (
      fraction.kind === "op" &&
      fraction.op === "/" &&
      wholeNumber(fraction.left) &&
      wholeNumber(fraction.right)
    ) {
      const mixed: Expr = {
        kind: "op",
        op: "+",
        left: whole,
        right: fraction,
        mixed: true,
      };
      left = left.kind === "neg" ? { kind: "neg", arg: mixed } : mixed;
    } else left = { kind: "op", op: "*", left, right: fraction };
  }
  for (;;) {
    if (reader.isChar("*") || reader.isCommand("cdot", "times", "ast")) {
      reader.next();
      left = { kind: "op", op: "*", left, right: unary(reader) };
    } else if (reader.isChar("/") || reader.isCommand("div")) {
      reader.next();
      left = { kind: "op", op: "/", left, right: unary(reader) };
    } else if (startsFactor(reader))
      left = { kind: "op", op: "*", left, right: power(reader) };
    else return left;
  }
}

function unary(reader: Reader): Expr {
  if (reader.isChar("-")) {
    reader.next();
    return { kind: "neg", arg: unary(reader) };
  }
  if (reader.isChar("+")) {
    reader.next();
    return unary(reader);
  }
  return power(reader);
}

/** What follows ^ or _: a braced group, or a single digit, letter or symbol. */
function script(reader: Reader): Expr {
  if (reader.isChar("{")) {
    reader.next();
    const inner = sum(reader);
    reader.expect("}");
    return inner;
  }
  const token = reader.peek();
  // x^23 in LaTeX is x squared, then 3: a script takes one digit.
  if (token?.kind === "num" && /^\d{2,}$/u.test(token.text)) {
    const digit = token.text.slice(0, 1);
    token.text = token.text.slice(1);
    return { kind: "num", value: Number(digit) };
  }
  if (token?.kind === "num" || token?.kind === "letter") {
    reader.next();
    return token.kind === "num"
      ? { kind: "num", value: Number(token.text) }
      : letter(token.name);
  }
  if (token?.kind === "command") return primary(reader);
  throw new Error("unreadable");
}

/** A letter is a quantity, except e, which school mathematics reads as Euler's number. */
const letter = (name: string): Expr =>
  name === "e" ? { kind: "num", value: Math.E } : { kind: "var", name };

function power(reader: Reader): Expr {
  const base = primary(reader);
  if (reader.isChar("^")) {
    reader.next();
    return { kind: "op", op: "^", left: base, right: script(reader) };
  }
  return base;
}

function group(reader: Reader): Expr {
  reader.expect("{");
  const inner = sum(reader);
  reader.expect("}");
  return inner;
}

function primary(reader: Reader): Expr {
  const token = reader.next();
  if (!token) throw new Error("unreadable");
  if (token.kind === "num") return { kind: "num", value: Number(token.text) };
  if (token.kind === "letter") {
    if (!reader.isChar("_")) return letter(token.name);
    let name = token.name;
    if (reader.isChar("_")) {
      reader.next();
      const sub = reader.next();
      if (sub?.kind === "num" || sub?.kind === "letter")
        name += `_${sub.kind === "num" ? sub.text : sub.name}`;
      else if (sub?.kind === "char" && sub.value === "{") {
        let label = "";
        while (!reader.isChar("}")) {
          const part = reader.next();
          if (!part) throw new Error("unreadable");
          label +=
            part.kind === "num"
              ? part.text
              : part.kind === "letter"
                ? part.name
                : "";
        }
        reader.next();
        name += `_${label}`;
      } else throw new Error("unreadable");
    }
    return { kind: "var", name };
  }
  if (token.kind === "char") {
    if (token.value === "(" || token.value === "[" || token.value === "{") {
      const inner = sum(reader);
      reader.expect({ "(": ")", "[": "]", "{": "}" }[token.value]);
      return inner;
    }
    if (token.value === "|") {
      reader.bars += 1;
      const inner = sum(reader);
      reader.expect("|");
      reader.bars -= 1;
      return { kind: "fn", name: "abs", arg: inner };
    }
    throw new Error("unreadable");
  }
  const { name } = token;
  if (name === "frac" || name === "dfrac" || name === "tfrac") {
    const top = group(reader);
    const bottom = group(reader);
    return { kind: "op", op: "/", left: top, right: bottom };
  }
  if (name === "sqrt") {
    let index: Expr = { kind: "num", value: 2 };
    if (reader.isChar("[")) {
      reader.next();
      index = sum(reader);
      reader.expect("]");
    }
    return {
      kind: "op",
      op: "^",
      left: group(reader),
      right: {
        kind: "op",
        op: "/",
        left: { kind: "num", value: 1 },
        right: index,
      },
    };
  }
  if (name === "pi") return { kind: "num", value: Math.PI };
  if (name === "e") return { kind: "num", value: Math.E };
  if (GREEK.has(name)) return { kind: "var", name };
  if (FUNCTIONS.has(name)) {
    let base: Expr | undefined;
    if (name === "log" && reader.isChar("_")) {
      reader.next();
      base = script(reader);
    }
    // \sin^2 x is (\sin x)^2.
    let exponent: Expr | undefined;
    if (reader.isChar("^")) {
      reader.next();
      exponent = script(reader);
    }
    // \sin 2x is \sin(2x): the run of factors after the name.
    let arg = power(reader);
    while (startsFactor(reader) && !reader.isCommand(...FUNCTIONS))
      arg = { kind: "op", op: "*", left: arg, right: power(reader) };
    const applied: Expr = { kind: "fn", name, arg, ...(base ? { base } : {}) };
    return exponent
      ? { kind: "op", op: "^", left: applied, right: exponent }
      : applied;
  }
  throw new Error("unreadable");
}

function apply(name: string, arg: number, base: number | null): number {
  switch (name) {
    case "abs":
      return Math.abs(arg);
    case "sin":
      return Math.sin(arg);
    case "cos":
      return Math.cos(arg);
    case "tan":
      return Math.tan(arg);
    case "sec":
      return 1 / Math.cos(arg);
    case "csc":
      return 1 / Math.sin(arg);
    case "cot":
      return 1 / Math.tan(arg);
    case "arcsin":
      return Math.asin(arg);
    case "arccos":
      return Math.acos(arg);
    case "arctan":
      return Math.atan(arg);
    case "sinh":
      return Math.sinh(arg);
    case "cosh":
      return Math.cosh(arg);
    case "tanh":
      return Math.tanh(arg);
    case "ln":
      return Math.log(arg);
    case "exp":
      return Math.exp(arg);
    case "log":
      return base === null ? Math.log10(arg) : Math.log(arg) / Math.log(base);
    default:
      return Number.NaN;
  }
}

function raise(left: number, right: number): number {
  // An odd root of a negative number is real.
  if (left < 0 && Number.isFinite(right) && right !== 0) {
    const inverse = 1 / right;
    if (
      Math.abs(inverse - Math.round(inverse)) < 1e-12 &&
      Math.round(inverse) % 2 !== 0
    )
      return -((-left) ** right);
  }
  return left ** right;
}

function evaluate(expr: Expr, values: ReadonlyMap<string, number>): number {
  if (expr.kind === "num") return expr.value;
  if (expr.kind === "var") return values.get(expr.name) ?? Number.NaN;
  if (expr.kind === "neg") return -evaluate(expr.arg, values);
  if (expr.kind === "fn")
    return apply(
      expr.name,
      evaluate(expr.arg, values),
      expr.base ? evaluate(expr.base, values) : null,
    );
  const left = evaluate(expr.left, values);
  const right = evaluate(expr.right, values);
  if (expr.op === "+") return left + right;
  if (expr.op === "-") return left - right;
  if (expr.op === "*") return left * right;
  if (expr.op === "/") return left / right;
  return raise(left, right);
}

function letters(expr: Expr, into: Set<string>): Set<string> {
  if (expr.kind === "var") into.add(expr.name);
  if (expr.kind === "neg") letters(expr.arg, into);
  if (expr.kind === "op") {
    letters(expr.left, into);
    letters(expr.right, into);
  }
  if (expr.kind === "fn") {
    letters(expr.arg, into);
    if (expr.base) letters(expr.base, into);
  }
  return into;
}

/** An expression, or an equation as one side minus the other. */
const difference = (statement: Statement): Expr =>
  statement.right
    ? { kind: "op", op: "-", left: statement.left, right: statement.right }
    : statement.left;

export interface Statement {
  left: Expr;
  /** The other side of an equation, if it is one. */
  right: Expr | null;
}

/** A piece of LaTeX as an expression or an equation, or null where it cannot be read. */
export function readMath(latex: string): Statement | null {
  const tokens = tokenize(latex);
  if (!tokens || tokens.length === 0) return null;
  try {
    const reader = new Reader(tokens);
    const left = sum(reader);
    let right: Expr | null = null;
    if (reader.isChar("=")) {
      reader.next();
      right = sum(reader);
    }
    return reader.done() ? { left, right } : null;
  } catch {
    return null;
  }
}

/** A generator of numbers between 0 and 1 that repeats for the same seed. */
function sequence(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed)
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 12;

/** Sample values of the letters: away from zero and the integers, both signs. */
function samples(names: readonly string[]): Map<string, number>[] {
  const random = sequence(names.join(","));
  return Array.from(
    { length: names.length === 0 ? 1 : SAMPLES },
    (_, index) =>
      new Map(
        names.map((name) => {
          const size = 0.3 + random() * 2.9;
          const nudged = Number.isInteger(size) ? size + 0.37 : size;
          return [name, index % 3 === 2 ? -nudged : nudged];
        }),
      ),
  );
}

const close = (a: number, b: number, tolerance: number) =>
  Math.abs(a - b) <=
  Math.max(tolerance, 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));

/**
 * Whether two pieces of mathematics are the same: two expressions with the
 * same value wherever both have one, or two equations with the same
 * solutions (one side minus the other a constant multiple of the other's).
 * `tolerance` lets a number be as far from the key as a teacher allows.
 * Null when either cannot be read.
 */
export function sameMath(
  answer: string,
  key: string,
  tolerance = 0,
): boolean | null {
  const given = readMath(answer);
  const wanted = readMath(key);
  if (!given || !wanted) return null;
  if ((given.right === null) !== (wanted.right === null)) return false;
  const found = new Set<string>();
  for (const side of [given.left, given.right, wanted.left, wanted.right])
    if (side) letters(side, found);
  const names = [...found].toSorted();
  const a = difference(given);
  const b = difference(wanted);
  let compared = 0;
  let ratio: number | null = null;
  for (const values of samples(names)) {
    const x = evaluate(a, values);
    const y = evaluate(b, values);
    const xFinite = Number.isFinite(x);
    const yFinite = Number.isFinite(y);
    if (!xFinite && !yFinite) continue;
    if (xFinite !== yFinite) return false;
    compared += 1;
    if (!given.right) {
      if (!close(x, y, tolerance)) return false;
      continue;
    }
    // Equations agree when one side's difference is a fixed multiple of the other's.
    if (Math.abs(y) < 1e-12) {
      if (Math.abs(x) >= 1e-9) return false;
      continue;
    }
    const k = x / y;
    if (ratio === null) ratio = k;
    else if (!close(k, ratio, 0)) return false;
  }
  if (ratio !== null && Math.abs(ratio) < 1e-12) return false;
  // Too few samples with a value says nothing either way.
  return compared >= (names.length === 0 ? 1 : 4);
}

/** Whether two pieces of LaTeX are written alike, spacing and sizing aside. */
export function sameLatex(a: string, b: string): boolean {
  const plain = (latex: string) =>
    westernDigits(latex)
      .replace(/\\(?:left|right|[,;:! ]|quad|qquad)/gu, "")
      .replace(/\s+/gu, "");
  return plain(a) === plain(b);
}
