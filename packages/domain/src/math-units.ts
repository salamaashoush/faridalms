/**
 * A maths answer with units, as science asks for one: 9.8 m/s², 25 °C,
 * 3 ft. It is read as a number times units, as STACK's units input reads
 * one, and two quantities are compared in SI base units, so 980 cm/s² is
 * 9.8 m/s². A teacher may instead ask for the units the key is written in.
 * Unit symbols are case sensitive, as SI writes them; US customary units
 * are read too, for American schools.
 */

/** Powers of the SI base units: metre, kilogram, second, ampere, kelvin, mole, candela. */
type Dimension = readonly number[];

interface Unit {
  factor: number;
  dimension: Dimension;
  /** A unit that takes no prefix, so "min" is never milli-inch. */
  plain?: true;
  /** A temperature scale whose zero is not absolute: kelvin = value × factor + offset. */
  offset?: number;
}

const NONE: Dimension = [0, 0, 0, 0, 0, 0, 0];
const dim = (...powers: number[]): Dimension =>
  NONE.map((_, index) => powers[index] ?? 0);

const UNITS: Record<string, Unit> = {
  m: { factor: 1, dimension: dim(1) },
  g: { factor: 1e-3, dimension: dim(0, 1) },
  s: { factor: 1, dimension: dim(0, 0, 1) },
  A: { factor: 1, dimension: dim(0, 0, 0, 1) },
  K: { factor: 1, dimension: dim(0, 0, 0, 0, 1) },
  mol: { factor: 1, dimension: dim(0, 0, 0, 0, 0, 1) },
  cd: { factor: 1, dimension: dim(0, 0, 0, 0, 0, 0, 1) },
  N: { factor: 1, dimension: dim(1, 1, -2) },
  J: { factor: 1, dimension: dim(2, 1, -2) },
  W: { factor: 1, dimension: dim(2, 1, -3) },
  Pa: { factor: 1, dimension: dim(-1, 1, -2) },
  Hz: { factor: 1, dimension: dim(0, 0, -1) },
  C: { factor: 1, dimension: dim(0, 0, 1, 1) },
  V: { factor: 1, dimension: dim(2, 1, -3, -1) },
  Ω: { factor: 1, dimension: dim(2, 1, -3, -2) },
  L: { factor: 1e-3, dimension: dim(3) },
  l: { factor: 1e-3, dimension: dim(3) },
  t: { factor: 1000, dimension: dim(0, 1) },
  eV: { factor: 1.602176634e-19, dimension: dim(2, 1, -2) },
  min: { factor: 60, dimension: dim(0, 0, 1), plain: true },
  h: { factor: 3600, dimension: dim(0, 0, 1), plain: true },
  ha: { factor: 1e4, dimension: dim(2), plain: true },
  "°": { factor: Math.PI / 180, dimension: NONE, plain: true },
  rad: { factor: 1, dimension: NONE, plain: true },
  "%": { factor: 0.01, dimension: NONE, plain: true },
  "°C": {
    factor: 1,
    dimension: dim(0, 0, 0, 0, 1),
    plain: true,
    offset: 273.15,
  },
  "°F": {
    factor: 5 / 9,
    dimension: dim(0, 0, 0, 0, 1),
    plain: true,
    offset: 273.15 - (32 * 5) / 9,
  },
  in: { factor: 0.0254, dimension: dim(1), plain: true },
  ft: { factor: 0.3048, dimension: dim(1), plain: true },
  yd: { factor: 0.9144, dimension: dim(1), plain: true },
  mi: { factor: 1609.344, dimension: dim(1), plain: true },
  lb: { factor: 0.45359237, dimension: dim(0, 1), plain: true },
  oz: { factor: 0.028349523125, dimension: dim(0, 1), plain: true },
  gal: { factor: 0.003785411784, dimension: dim(3), plain: true },
  mph: { factor: 0.44704, dimension: dim(1, 0, -1), plain: true },
};

const PREFIXES: Record<string, number> = {
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  h: 1e2,
  da: 10,
  d: 0.1,
  c: 0.01,
  m: 1e-3,
  µ: 1e-6,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
};

/** A unit symbol as written: a unit, or a prefix and a unit that takes one. */
function unitOf(symbol: string): Unit | null {
  const found = UNITS[symbol];
  if (found) return found;
  for (const [prefix, scale] of Object.entries(PREFIXES)) {
    const base = symbol.startsWith(prefix)
      ? UNITS[symbol.slice(prefix.length)]
      : undefined;
    if (base && !base.plain) return { ...base, factor: base.factor * scale };
  }
  return null;
}

/** LaTeX for units as plain symbols and * / ^ ( ). */
function plainUnits(latex: string): string {
  let text = latex
    .replaceAll(/\\(?:left|right)/gu, "")
    .replaceAll(/\^\s*\{?\s*\\circ\s*\}?|\\degree/gu, "°")
    .replaceAll(/\\(?:mu|micro)\b/gu, "µ")
    .replaceAll("μ", "µ")
    .replaceAll(/\\Omega\b/gu, "Ω")
    .replaceAll(/\\%/gu, "%")
    .replaceAll(/\\(?:cdot|times)\b|[·×]/gu, "*")
    .replaceAll(/\\[,;:! ]|~|\\quad\b/gu, " ")
    .replaceAll(/\\(?:mathrm|text|textrm|operatorname|mathit|mbox)\s*/gu, "");
  // \frac{a}{b} as (a)/(b), innermost first.
  for (let pass = 0; pass < 8 && text.includes("\\frac"); pass += 1)
    text = text.replaceAll(
      /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/gu,
      "($1)/($2)",
    );
  return (
    text
      .replaceAll("{", "(")
      .replaceAll("}", ")")
      // 25^\circ\mathrm{C} is degrees Celsius, not degrees times coulombs.
      .replaceAll(/°\s*\(?\s*([CF])\s*\)?/gu, "°$1")
  );
}

type Token =
  | { kind: "unit"; symbol: string }
  | { kind: "num"; value: number }
  | { kind: "op"; value: string };

function tokens(text: string): Token[] | null {
  const found: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const rest = text.slice(at);
    const space = /^\s+/u.exec(rest)?.[0];
    if (space) {
      at += space.length;
      continue;
    }
    const symbol = /^(?:°[CF]?|%|[A-Za-zµΩ]+)/u.exec(rest)?.[0];
    if (symbol) {
      found.push({ kind: "unit", symbol });
      at += symbol.length;
      continue;
    }
    const number = /^-?\d+/u.exec(rest)?.[0];
    if (number) {
      found.push({ kind: "num", value: Number(number) });
      at += number.length;
      continue;
    }
    const character = rest[0] ?? "";
    if (!"*/^()".includes(character)) return null;
    found.push({ kind: "op", value: character });
    at += 1;
  }
  return found;
}

/** Units as each symbol written and its power, as m/s² is m¹ s⁻². */
type Powers = Map<string, number>;

function merge(into: Powers, from: Powers, sign: number) {
  for (const [symbol, power] of from)
    into.set(symbol, (into.get(symbol) ?? 0) + sign * power);
}

function unitPowers(text: string): Powers | null {
  const list = tokens(text);
  if (!list || list.length === 0) return null;
  let at = 0;
  const peek = () => list[at];
  const isOp = (value: string) => {
    const next = peek();
    return next?.kind === "op" && next.value === value;
  };
  const exponent = (): number | null => {
    if (isOp("^")) {
      at += 1;
      const open = isOp("(");
      if (open) at += 1;
      const value = peek();
      if (value?.kind !== "num") return null;
      at += 1;
      if (open) {
        if (!isOp(")")) return null;
        at += 1;
      }
      return value.value;
    }
    return 1;
  };
  const factor = (): Powers | null => {
    const next = peek();
    let powers: Powers | null = null;
    if (next?.kind === "unit") {
      at += 1;
      powers = new Map([[next.symbol, 1]]);
    } else if (next?.kind === "op" && next.value === "(") {
      at += 1;
      powers = product();
      const close = peek();
      if (!powers || close?.kind !== "op" || close.value !== ")") return null;
      at += 1;
    } else return null;
    const power = exponent();
    if (power === null) return null;
    return new Map([...powers].map(([symbol, each]) => [symbol, each * power]));
  };
  const product = (): Powers | null => {
    const result = factor();
    if (!result) return null;
    for (;;) {
      const next = peek();
      if (!next || (next.kind === "op" && next.value === ")")) return result;
      let sign = 1;
      if (next.kind === "op" && (next.value === "*" || next.value === "/")) {
        sign = next.value === "/" ? -1 : 1;
        at += 1;
      }
      const more = factor();
      if (!more) return null;
      merge(result, more, sign);
    }
  };
  const powers = product();
  return powers && at === list.length ? powers : null;
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/gu;
const NUMBER =
  /^\s*([-+−]?\s*\d+(?:\.\d+)?)(?:\s*(?:\\times|\\cdot|×|\*)\s*10\s*\^\s*\{?\s*([-−]?\d+)\s*\}?)?/u;

/** A quantity: its number as written, and its value and units. */
export interface Quantity {
  /** The number as LaTeX, for a form a teacher asks of it. */
  number: string;
  value: number;
  powers: Powers;
}

/** A number followed by units, or null where the LaTeX is not one. */
export function readQuantity(latex: string): Quantity | null {
  const text = latex
    .replace(ARABIC_DIGITS, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replaceAll(/(\d)(?:\{,\}|٫|,)(\d)/gu, "$1.$2");
  const match = NUMBER.exec(text);
  if (!match?.[1]) return null;
  const mantissa = Number(match[1].replaceAll(/\s+/gu, "").replace("−", "-"));
  const power = match[2] ? Number(match[2].replace("−", "-")) : 0;
  const rest = text.slice(match[0].length).trim();
  if (!rest)
    return {
      number: match[0].trim(),
      value: mantissa * 10 ** power,
      powers: new Map(),
    };
  const powers = unitPowers(plainUnits(rest));
  if (!powers || [...powers.keys()].some((symbol) => !unitOf(symbol)))
    return null;
  return { number: match[0].trim(), value: mantissa * 10 ** power, powers };
}

/**
 * A quantity in SI base units, with how much one of its own units is in
 * them; null for a temperature scale inside other units.
 */
function inBaseUnits(
  quantity: Quantity,
): { value: number; scale: number; dimension: Dimension } | null {
  const entries = [...quantity.powers].filter(([, power]) => power !== 0);
  const [only] = entries;
  const lone = entries.length === 1 && only?.[1] === 1 ? unitOf(only[0]) : null;
  if (lone?.offset !== undefined)
    return {
      value: quantity.value * lone.factor + lone.offset,
      scale: lone.factor,
      dimension: lone.dimension,
    };
  let scale = 1;
  const dimension = [...NONE];
  for (const [symbol, power] of entries) {
    const unit = unitOf(symbol);
    if (!unit || unit.offset !== undefined) return null;
    scale *= unit.factor ** power;
    unit.dimension.forEach((each, index) => {
      dimension[index] = (dimension[index] ?? 0) + each * power;
    });
  }
  return { value: quantity.value * scale, scale, dimension };
}

/** Units as written, in one order, so m/s and s⁻¹ m compare equal. */
const written = (powers: Powers) =>
  [...powers]
    .filter(([, power]) => power !== 0)
    .toSorted(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .join(";");

const close = (a: number, b: number, tolerance: number) =>
  Math.abs(a - b) <=
  Math.max(tolerance, 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));

/**
 * How an answer with units compares with a key that has them: right; the
 * same quantity in other units where those were asked for; a number
 * without its units; or wrong. Null where the key has no units to compare.
 */
export function compareQuantity(
  answer: string,
  key: string,
  tolerance: number,
  strict: boolean,
): "right" | "units" | "unitless" | "wrong" | null {
  const wanted = readQuantity(key);
  if (!wanted || wanted.powers.size === 0) return null;
  const given = readQuantity(answer);
  if (!given) return "wrong";
  if (given.powers.size === 0)
    return close(given.value, wanted.value, tolerance) ? "unitless" : "wrong";
  if (written(given.powers) === written(wanted.powers))
    return close(given.value, wanted.value, tolerance) ? "right" : "wrong";
  const a = inBaseUnits(given);
  const b = inBaseUnits(wanted);
  if (
    !a ||
    !b ||
    a.dimension.some((power, index) => power !== b.dimension[index])
  )
    return "wrong";
  // The tolerance is in the key's units; in base units it scales with them.
  if (!close(a.value, b.value, tolerance * b.scale)) return "wrong";
  return strict ? "units" : "right";
}

/**
 * The key's value in the units an answer is written in, with the answer's
 * number as written; null where the two measure different things or either
 * has no units.
 */
export function keyInAnswerUnits(
  answer: string,
  key: string,
): { written: string; value: number; sameUnits: boolean } | null {
  const given = readQuantity(answer);
  const wanted = readQuantity(key);
  if (!given || !wanted || given.powers.size === 0 || wanted.powers.size === 0)
    return null;
  if (written(given.powers) === written(wanted.powers))
    return { written: given.number, value: wanted.value, sameUnits: true };
  const a = inBaseUnits(given);
  const b = inBaseUnits(wanted);
  if (
    !a ||
    !b ||
    a.dimension.some((power, index) => power !== b.dimension[index])
  )
    return null;
  // A temperature scale's zero is where its offset puts it.
  const offset = a.value - given.value * a.scale;
  return {
    written: given.number,
    value: (b.value - offset) / a.scale,
    sameUnits: false,
  };
}
