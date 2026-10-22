import type { Expr } from "./math-answers";

import { readMath } from "./math-answers";

/**
 * The forms a teacher may ask a maths answer to be written in, as school
 * papers ask: "factorise completely", "expand and simplify", "give the
 * fraction in its simplest form", "write in standard form". The value is
 * marked elsewhere; these say only whether the writing has the form, as
 * STACK's FacForm and Expanded tests do, without a computer algebra system:
 * polynomials are worked with exactly over the rational numbers.
 */
export const MATH_FORMS = [
  "factorised",
  "expanded",
  "fraction",
  "standard",
  "figures",
  "places",
] as const;
export type MathForm = (typeof MATH_FORMS)[number];

/** Forms that are a number written to a precision, given with how many figures or places. */
export const PRECISION_FORMS = new Set<MathForm>(["figures", "places"]);
/** Forms the writing of an answer shows, rather than its precision. */
export type WrittenForm = Exclude<MathForm, "figures" | "places">;

export const isWrittenForm = (form: MathForm): form is WrittenForm =>
  !PRECISION_FORMS.has(form);

interface Rational {
  n: number;
  d: number;
}

const gcd = (a: number, b: number): number => {
  let [x, y] = [Math.abs(a), Math.abs(b)];
  while (y) [x, y] = [y, x % y];
  return x;
};

function rational(n: number, d = 1): Rational {
  const divisor = gcd(n, d) || 1;
  const sign = d < 0 ? -1 : 1;
  return { n: (sign * n) / divisor, d: (sign * d) / divisor };
}

const add = (a: Rational, b: Rational) =>
  rational(a.n * b.d + b.n * a.d, a.d * b.d);
const times = (a: Rational, b: Rational) => rational(a.n * b.n, a.d * b.d);

/** A number as the exact fraction its decimal writing is, or null for π, e and the like. */
function exactly(value: number): Rational | null {
  if (!Number.isFinite(value)) return null;
  if (Number.isInteger(value))
    return Number.isSafeInteger(value) ? rational(value) : null;
  const text = String(value);
  const decimals = /^-?\d+\.(\d{1,9})$/u.exec(text)?.[1];
  if (!decimals) return null;
  const scale = 10 ** decimals.length;
  return rational(Math.round(value * scale), scale);
}

/** A polynomial: each term's letters and powers, written `x^2 y^1`, with its coefficient. */
type Poly = Map<string, Rational>;

const MAX_DEGREE = 12;

const powersOf = (key: string): [string, number][] =>
  key
    ? key.split(" ").map((part) => {
        const [name = "", power = "1"] = part.split("^");
        return [name, Number(power)];
      })
    : [];

const keyOf = (powers: Iterable<[string, number]>) =>
  [...powers]
    .filter(([, power]) => power > 0)
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, power]) => `${name}^${power}`)
    .join(" ");

function plus(a: Poly, b: Poly): Poly {
  const sum = new Map(a);
  for (const [key, value] of b) {
    const total = add(sum.get(key) ?? rational(0), value);
    if (total.n === 0) sum.delete(key);
    else sum.set(key, total);
  }
  return sum;
}

const scaled = (a: Poly, by: Rational): Poly =>
  by.n === 0
    ? new Map()
    : new Map([...a].map(([key, value]) => [key, times(value, by)]));

function product(a: Poly, b: Poly): Poly {
  let result: Poly = new Map();
  for (const [left, x] of a)
    for (const [right, y] of b) {
      const powers = new Map(powersOf(left));
      for (const [name, power] of powersOf(right))
        powers.set(name, (powers.get(name) ?? 0) + power);
      result = plus(result, new Map([[keyOf(powers), times(x, y)]]));
    }
  return result;
}

const constant = (value: Rational): Poly =>
  value.n === 0 ? new Map() : new Map([["", value]]);

const degreeOf = (poly: Poly) =>
  Math.max(
    0,
    ...[...poly.keys()].map((key) =>
      powersOf(key).reduce((sum, [, power]) => sum + power, 0),
    ),
  );

/** The polynomial an expression is, or null where it is not one: a letter under a root or below a line. */
function polynomial(expr: Expr): Poly | null {
  switch (expr.kind) {
    case "num": {
      const value = exactly(expr.value);
      return value ? constant(value) : null;
    }
    case "var":
      return new Map([[`${expr.name}^1`, rational(1)]]);
    case "neg": {
      const inner = polynomial(expr.arg);
      return inner ? scaled(inner, rational(-1)) : null;
    }
    case "fn":
      return null;
    case "op": {
      const left = polynomial(expr.left);
      const right = polynomial(expr.right);
      if (!left || !right) return null;
      if (expr.op === "+") return plus(left, right);
      if (expr.op === "-") return plus(left, scaled(right, rational(-1)));
      if (expr.op === "*") return product(left, right);
      const only = right.size === 1 ? right.get("") : undefined;
      if (expr.op === "/")
        return only ? scaled(left, rational(only.d, only.n)) : null;
      // A power must be a whole number, small enough to work out.
      if (
        !only ||
        only.d !== 1 ||
        only.n < 0 ||
        only.n * degreeOf(left) > MAX_DEGREE
      )
        return null;
      let result = constant(rational(1));
      for (let index = 0; index < only.n; index += 1)
        result = product(result, left);
      return result;
    }
  }
  return null;
}

const isConstant = (expr: Expr): boolean =>
  expr.kind === "num" ||
  (expr.kind === "neg" && isConstant(expr.arg)) ||
  (expr.kind === "op" && isConstant(expr.left) && isConstant(expr.right));

/** The letters of a polynomial. */
const lettersOf = (poly: Poly) =>
  new Set(
    [...poly.keys()].flatMap((key) => powersOf(key).map(([name]) => name)),
  );

/** A polynomial in one letter as its coefficients, lowest power first. */
function coefficients(poly: Poly, letter: string): Rational[] {
  const result: Rational[] = [];
  for (const [key, value] of poly) {
    const power = powersOf(key).find(([name]) => name === letter)?.[1] ?? 0;
    while (result.length <= power) result.push(rational(0));
    result[power] = add(result[power] ?? rational(0), value);
  }
  return result;
}

/** Whole-number coefficients with no factor in common, as a polynomial is up to a constant. */
function wholeNumbers(values: readonly Rational[]): number[] {
  const multiple = values.reduce(
    (lcm, value) => (lcm * value.d) / gcd(lcm, value.d),
    1,
  );
  const scaledUp = values.map((value) => (value.n * multiple) / value.d);
  const common =
    scaledUp.reduce((divisor, value) => gcd(divisor, value), 0) || 1;
  return scaledUp.map((value) => value / common);
}

const divisors = (value: number): number[] => {
  const size = Math.abs(value);
  if (size === 0 || size > 1e6) return [];
  const found: number[] = [];
  for (let candidate = 1; candidate * candidate <= size; candidate += 1)
    if (size % candidate === 0) found.push(candidate, size / candidate);
  return found;
};

/** Whether a polynomial in one letter has a rational root, by the rational root theorem. */
function hasRationalRoot(values: readonly Rational[]): boolean {
  const integers = wholeNumbers(values);
  const lowest = integers.findIndex((value) => value !== 0);
  if (lowest > 0) return true;
  const last = integers.at(-1) ?? 0;
  for (const p of divisors(integers[0] ?? 0))
    for (const q of divisors(last))
      for (const root of [p / q, -p / q]) {
        let value = 0;
        for (let index = integers.length - 1; index >= 0; index -= 1)
          value = value * root + (integers[index] ?? 0);
        if (Math.abs(value) < 1e-9 * Math.max(1, ...integers.map(Math.abs)))
          return true;
      }
  return false;
}

function trimmed(values: Rational[]): Rational[] {
  const copy = [...values];
  while (copy.length > 0 && copy.at(-1)?.n === 0) copy.pop();
  return copy;
}

/** The greatest common divisor of two polynomials in one letter, as its degree. */
function commonDegree(a: Rational[], b: Rational[]): number {
  let x = trimmed(a);
  let y = trimmed(b);
  while (y.length > 0) {
    const remainder = [...x];
    const lead = y.at(-1) ?? rational(1);
    while (remainder.length >= y.length && remainder.length > 0) {
      const factor = times(
        remainder.at(-1) ?? rational(0),
        rational(lead.d, lead.n),
      );
      const shift = remainder.length - y.length;
      y.forEach((value, index) => {
        remainder[index + shift] = add(
          remainder[index + shift] ?? rational(0),
          times(value, rational(-factor.n, factor.d)),
        );
      });
      remainder.pop();
      while (remainder.length > 0 && remainder.at(-1)?.n === 0) remainder.pop();
    }
    [x, y] = [y, remainder];
  }
  return Math.max(0, x.length - 1);
}

/** Whether a polynomial in one letter splits over the rationals, as far as school algebra goes. */
function splitsInOne(values: Rational[]): boolean {
  const degree = values.length - 1;
  if (degree <= 1) return false;
  if (hasRationalRoot(values)) return true;
  // x⁴ + 3x² + 2 splits as a quadratic in x² does.
  const step = values.reduce(
    (divisor, value, index) => (value.n === 0 ? divisor : gcd(divisor, index)),
    0,
  );
  if (step > 1)
    return splitsInOne(values.filter((_, index) => index % step === 0));
  return false;
}

/**
 * Whether a polynomial with no factor common to all its terms splits into
 * factors over the rationals. Exact for one letter up to degree three and
 * for the forms school algebra meets beyond that: powers of a square, two
 * letters of one degree (x² − y²), and a letter met only to the first power
 * (xy + 2x + 3y + 6). Past those it takes the factor as it was written.
 */
function splits(poly: Poly): boolean {
  if (degreeOf(poly) <= 1) return false;
  const letters = [...lettersOf(poly)].toSorted();
  const [first, second] = letters;
  if (letters.length === 1 && first)
    return splitsInOne(coefficients(poly, first));
  const degrees = new Set(
    [...poly.keys()].map((key) =>
      powersOf(key).reduce((sum, [, power]) => sum + power, 0),
    ),
  );
  // A form of one degree in two letters splits as it does with one letter set to 1.
  if (letters.length === 2 && first && second && degrees.size === 1) {
    const dropped: Poly = new Map();
    for (const [key, value] of poly)
      dropped.set(
        keyOf(powersOf(key).filter(([name]) => name !== second)),
        value,
      );
    return splitsInOne(coefficients(dropped, first));
  }
  for (const letter of letters) {
    const parts = coefficients(poly, letter);
    if (parts.length !== 2 || letters.length !== 2) continue;
    // A·x + B splits when A and B share a factor in the other letter.
    const other = letters.find((name) => name !== letter) ?? "";
    const split = (power: number): Poly => {
      const kept: Poly = new Map();
      for (const [key, value] of poly) {
        const powers = powersOf(key);
        if ((powers.find(([name]) => name === letter)?.[1] ?? 0) === power)
          kept.set(keyOf(powers.filter(([name]) => name !== letter)), value);
      }
      return kept;
    };
    return (
      commonDegree(
        coefficients(split(1), other),
        coefficients(split(0), other),
      ) > 0
    );
  }
  return false;
}

/** What an expression multiplies together, powers taken as their bases. */
function factors(expr: Expr): Expr[] {
  if (expr.kind === "neg") return factors(expr.arg);
  if (expr.kind !== "op") return [expr];
  if (expr.op === "*") return [...factors(expr.left), ...factors(expr.right)];
  if (expr.op === "/" && isConstant(expr.right)) return factors(expr.left);
  const { right } = expr;
  if (
    expr.op === "^" &&
    right.kind === "num" &&
    Number.isInteger(right.value) &&
    right.value >= 1
  )
    return factors(expr.left);
  return [expr];
}

/** Whether an expression is written as a product of factors none of which splits further. */
function factorised(expr: Expr): boolean {
  for (const base of factors(expr)) {
    if (isConstant(base) || base.kind === "var") continue;
    const poly = polynomial(base);
    if (!poly) return false;
    if (poly.size <= 1) continue;
    const values = [...poly.values()];
    // A number every coefficient shares is taken out, as "factorise completely" asks.
    if (
      values.every((value) => value.d === 1) &&
      values.reduce((divisor, value) => gcd(divisor, value.n), 0) !== 1
    )
      return false;
    // So is a letter every term holds.
    const shared = [...lettersOf(poly)].some((letter) =>
      [...poly.keys()].every((key) =>
        powersOf(key).some(([name]) => name === letter),
      ),
    );
    if (shared || splits(poly)) return false;
  }
  return true;
}

/** The terms of a sum, signs aside. */
const terms = (expr: Expr): Expr[] =>
  expr.kind === "op" && (expr.op === "+" || expr.op === "-")
    ? [...terms(expr.left), ...terms(expr.right)]
    : expr.kind === "neg"
      ? terms(expr.arg)
      : [expr];

/** Whether a term is one number times letters, each written once. */
function monomial(expr: Expr): boolean {
  const seen = new Set<string>();
  let numbers = 0;
  const visit = (part: Expr): boolean => {
    if (part.kind === "num") {
      numbers += 1;
      return numbers <= 1;
    }
    if (part.kind === "var") {
      if (seen.has(part.name)) return false;
      seen.add(part.name);
      return true;
    }
    if (part.kind === "neg") return visit(part.arg);
    if (part.kind !== "op") return false;
    if (part.op === "*") return visit(part.left) && visit(part.right);
    if (part.op === "^")
      return (
        part.left.kind === "var" &&
        part.right.kind === "num" &&
        visit(part.left)
      );
    // x/2 is a term; (x + 1)/2 is not.
    if (part.op === "/") return isConstant(part.right) && visit(part.left);
    return false;
  };
  return visit(expr);
}

/** Whether an expression is written with its brackets multiplied out and like terms gathered. */
function expanded(expr: Expr): boolean {
  const parts = terms(expr);
  if (!parts.every(monomial)) return false;
  const poly = polynomial(expr);
  return poly !== null && parts.length === Math.max(1, poly.size);
}

function whole(part: Expr): number | null {
  if (part.kind === "num")
    return Number.isInteger(part.value) ? part.value : null;
  if (part.kind !== "neg") return null;
  const inner = whole(part.arg);
  return inner === null ? null : -inner;
}

/** Whether an expression is a whole number or a fraction of two in lowest terms. */
function simplestFraction(expr: Expr): boolean {
  if (expr.kind === "neg") return simplestFraction(expr.arg);
  if (whole(expr) !== null) return true;
  // A mixed number's fraction is a proper one in lowest terms.
  if (expr.kind === "op" && expr.mixed)
    return (
      expr.right.kind === "op" &&
      simplestFraction(expr.right) &&
      Math.abs(whole(expr.right.left) ?? 0) <
        Math.abs(whole(expr.right.right) ?? 0)
    );
  if (expr.kind !== "op" || expr.op !== "/") return false;
  const top = whole(expr.left);
  const bottom = whole(expr.right);
  return (
    top !== null &&
    bottom !== null &&
    Math.abs(bottom) > 1 &&
    gcd(top, bottom) === 1
  );
}

function mantissa(part: Expr): boolean {
  if (part.kind === "neg") return mantissa(part.arg);
  return (
    part.kind === "num" &&
    Math.abs(part.value) >= 1 &&
    Math.abs(part.value) < 10
  );
}

const tenTo = (part: Expr) =>
  part.kind === "op" &&
  part.op === "^" &&
  part.left.kind === "num" &&
  part.left.value === 10 &&
  whole(part.right) !== null;

/** Whether an expression is a × 10ⁿ, with a at least 1 and below 10 and n whole. */
function standardForm(expr: Expr): boolean {
  if (expr.kind === "neg") return standardForm(expr.arg);
  if (mantissa(expr) || tenTo(expr)) return true;
  return (
    expr.kind === "op" &&
    expr.op === "*" &&
    mantissa(expr.left) &&
    tenTo(expr.right)
  );
}

const CHECKS: Record<WrittenForm, (expr: Expr) => boolean> = {
  factorised,
  expanded,
  fraction: simplestFraction,
  standard: standardForm,
};

/**
 * Whether an answer is written in the form asked for: an equation's every
 * side, else the expression. Null where the answer cannot be read.
 */
export function inMathForm(latex: string, form: MathForm): boolean | null {
  if (form === "figures" || form === "places") return null;
  const read = readMath(latex);
  if (!read) return null;
  const check = CHECKS[form];
  // y = (x + 2)(x + 3) is factorised; its lone letter needs no form.
  return [read.left, read.right].every(
    (side) => !side || side.kind === "var" || check(side),
  );
}
