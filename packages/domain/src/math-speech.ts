import { arabicLetter } from "./arabic-math";
import { mathRuns, textDirection } from "./content";

/**
 * Mathematics said in words, as a teacher reads a formula out: for the
 * browser's voice reading a lesson, and for the label a screen reader gives
 * a choice whose text holds a formula. English follows ClearSpeak's habits
 * ("x squared", "the fraction with numerator … and denominator …"); Arabic
 * follows its school textbooks ("س تربيع", "كسر بسطه … ومقامه …"), whose
 * words no speech engine has rules for. It reads any LaTeX: what it does not
 * know it says as written, so nothing a teacher wrote goes unsaid.
 */

export type MathLanguage = "ar" | "en";

type Token =
  | { kind: "num"; text: string }
  | { kind: "letter"; text: string }
  | { kind: "command"; name: string }
  | { kind: "char"; value: string };

type Node =
  | { kind: "num"; text: string }
  | { kind: "id"; text: string }
  | { kind: "sym"; name: string }
  | { kind: "fn"; name: string }
  | { kind: "big"; name: string }
  | { kind: "frac"; top: Node[]; bottom: Node[] }
  | { kind: "root"; index: Node[] | null; body: Node[] }
  | { kind: "script"; base: Node; sup: Node[] | null; sub: Node[] | null }
  | { kind: "fence"; open: string; body: Node[] }
  | { kind: "accent"; name: string; body: Node[] }
  | { kind: "words"; text: string };

const WORDS: Record<string, [en: string, ar: string]> = {
  plus: ["plus", "زَائِد"],
  minus: ["minus", "نَاقِص"],
  negative: ["negative", "سَالِب"],
  pm: ["plus or minus", "زَائِد أَوْ نَاقِص"],
  mp: ["minus or plus", "نَاقِص أَوْ زَائِد"],
  times: ["times", "ضَرْب"],
  div: ["divided by", "قِسْمَة"],
  eq: ["equals", "يُسَاوِي"],
  ne: ["is not equal to", "لَا يُسَاوِي"],
  lt: ["is less than", "أَصْغَرُ مِنْ"],
  gt: ["is greater than", "أَكْبَرُ مِنْ"],
  le: ["is less than or equal to", "أَصْغَرُ مِنْ أَوْ يُسَاوِي"],
  ge: ["is greater than or equal to", "أَكْبَرُ مِنْ أَوْ يُسَاوِي"],
  approx: ["is approximately equal to", "يُسَاوِي تَقْرِيبًا"],
  equiv: ["is equivalent to", "يُكَافِئ"],
  sim: ["is similar to", "يُشَابِه"],
  cong: ["is congruent to", "يُطَابِق"],
  propto: ["is proportional to", "يَتَنَاسَبُ مَعَ"],
  to: ["to", "إِلَى"],
  approaches: ["approaches", "تَؤُولُ إِلَى"],
  implies: ["implies", "يُؤَدِّي إِلَى"],
  iff: ["if and only if", "إِذَا وَفَقَطْ إِذَا"],
  in: ["is in", "يَنْتَمِي إِلَى"],
  notin: ["is not in", "لَا يَنْتَمِي إِلَى"],
  subset: ["is a subset of", "مَجْمُوعَةٌ جُزْئِيَّةٌ مِنْ"],
  cup: ["union", "اِتِّحَاد"],
  cap: ["intersection", "تَقَاطُع"],
  emptyset: ["the empty set", "الْمَجْمُوعَةُ الْخَالِيَة"],
  infty: ["infinity", "مَا لَا نِهَايَة"],
  degree: ["degrees", "دَرَجَة"],
  percent: ["percent", "بِالْمِئَة"],
  factorial: ["factorial", "مَضْرُوب"],
  angle: ["angle", "الزَّاوِيَة"],
  triangle: ["triangle", "الْمُثَلَّث"],
  perp: ["is perpendicular to", "عَمُودِيٌّ عَلَى"],
  parallel: ["is parallel to", "يُوَازِي"],
  dots: ["dot dot dot", "وَهَكَذَا"],
  comma: ["comma", "فَاصِلَة"],
  ratio: ["to", "إِلَى"],
  prime: ["prime", "شَرْطَة"],
  therefore: ["therefore", "إِذَنْ"],
  because: ["because", "لِأَنَّ"],
  forall: ["for all", "لِكُلِّ"],
  exists: ["there exists", "يُوجَدُ"],
  not: ["not", "لَيْسَ"],
  and: ["and", "وَ"],
  or: ["or", "أَوْ"],
  compose: ["composed with", "تَرْكِيب"],
  row: ["next row", "السَّطْرُ التَّالِي"],
  squared: ["squared", "تَرْبِيع"],
  cubed: ["cubed", "تَكْعِيب"],
  power: ["to the power of", "أُسّ"],
  endPower: ["end power", "نِهَايَةُ الْأُسّ"],
  sub: ["sub", ""],
  over: ["over", "عَلَى"],
  fraction: ["the fraction with numerator", "كَسْرٌ بَسْطُهُ"],
  denominator: ["and denominator", "وَمَقَامُهُ"],
  squareRoot: ["the square root of", "الْجَذْرُ التَّرْبِيعِيّ"],
  cubeRoot: ["the cube root of", "الْجَذْرُ التَّكْعِيبِيّ"],
  rootOf: ["the root of index", "الْجَذْرُ مِنَ الدَّرَجَة"],
  rootIndexOf: ["of", ""],
  endRoot: ["end root", "نِهَايَةُ الْجَذْر"],
  open: ["open bracket", "اِفْتَحِ الْقَوْس"],
  close: ["close bracket", "أَغْلِقِ الْقَوْس"],
  openBrace: ["open brace", "اِفْتَحِ الْقَوْسَ الْمَعْقُوف"],
  closeBrace: ["close brace", "أَغْلِقِ الْقَوْسَ الْمَعْقُوف"],
  abs: ["the absolute value of", "الْقِيمَةُ الْمُطْلَقَة"],
  endAbs: ["end absolute value", "نِهَايَةُ الْقِيمَةِ الْمُطْلَقَة"],
  from: ["from", "مِنْ"],
  of: ["of", ""],
  base: ["base", "لِلْأَسَاس"],
  as: ["as", "عِنْدَمَا"],
  inverse: ["inverse", "مَعْكُوس"],
  vector: ["vector", "الْمُتَّجَه"],
  segment: ["segment", "الْقِطْعَةُ الْمُسْتَقِيمَة"],
  bar: ["bar", "بَار"],
  hat: ["hat", "قُبَّعَة"],
  sin: ["sine", "جَيْب"],
  cos: ["cosine", "جَيْبُ التَّمَام"],
  tan: ["tangent", "ظِلّ"],
  cot: ["cotangent", "ظِلُّ التَّمَام"],
  sec: ["secant", "قَاطِع"],
  csc: ["cosecant", "قَاطِعُ التَّمَام"],
  arcsin: ["inverse sine", "مَعْكُوسُ الْجَيْب"],
  arccos: ["inverse cosine", "مَعْكُوسُ جَيْبِ التَّمَام"],
  arctan: ["inverse tangent", "مَعْكُوسُ الظِّلّ"],
  sinh: ["hyperbolic sine", "الْجَيْبُ الزَّائِدِيّ"],
  cosh: ["hyperbolic cosine", "جَيْبُ التَّمَامِ الزَّائِدِيّ"],
  tanh: ["hyperbolic tangent", "الظِّلُّ الزَّائِدِيّ"],
  log: ["log", "لُوغَارِيتْم"],
  ln: ["natural log", "اللُّوغَارِيتْمُ الطَّبِيعِيّ"],
  exp: ["exponential", "الدَّالَّةُ الْأُسِّيَّة"],
  lim: ["the limit", "النِّهَايَة"],
  max: ["the maximum", "الْقِيمَةُ الْعُظْمَى"],
  min: ["the minimum", "الْقِيمَةُ الصُّغْرَى"],
  gcd: ["the greatest common divisor", "الْقَاسِمُ الْمُشْتَرَكُ الْأَكْبَر"],
  det: ["the determinant", "الْمُحَدِّد"],
  sum: ["the sum", "مَجْمُوع"],
  prod: ["the product", "حَاصِلُ ضَرْب"],
  int: ["the integral", "تَكَامُل"],
  N: ["the natural numbers", "الْأَعْدَادُ الطَّبِيعِيَّة"],
  Z: ["the integers", "الْأَعْدَادُ الصَّحِيحَة"],
  Q: ["the rational numbers", "الْأَعْدَادُ النِّسْبِيَّة"],
  R: ["the real numbers", "الْأَعْدَادُ الْحَقِيقِيَّة"],
  C: ["the complex numbers", "الْأَعْدَادُ الْمُرَكَّبَة"],
};

const GREEK: Record<string, [en: string, ar: string]> = {
  alpha: ["alpha", "أَلْفَا"],
  beta: ["beta", "بِيتَا"],
  gamma: ["gamma", "جَامَا"],
  delta: ["delta", "دِلْتَا"],
  epsilon: ["epsilon", "إِبْسِيلُون"],
  varepsilon: ["epsilon", "إِبْسِيلُون"],
  zeta: ["zeta", "زِيتَا"],
  eta: ["eta", "إِيتَا"],
  theta: ["theta", "ثِيتَا"],
  vartheta: ["theta", "ثِيتَا"],
  iota: ["iota", "يُوتَا"],
  kappa: ["kappa", "كَابَا"],
  lambda: ["lambda", "لَامْدَا"],
  mu: ["mu", "مِيُو"],
  nu: ["nu", "نِيُو"],
  xi: ["xi", "كْسَاي"],
  pi: ["pi", "بَاي"],
  rho: ["rho", "رُو"],
  sigma: ["sigma", "سِيجْمَا"],
  tau: ["tau", "تَاو"],
  upsilon: ["upsilon", "أُبْسِيلُون"],
  phi: ["phi", "فَاي"],
  varphi: ["phi", "فَاي"],
  chi: ["chi", "كَاي"],
  psi: ["psi", "بْسَاي"],
  omega: ["omega", "أُومِيجَا"],
  Gamma: ["capital gamma", "جَامَا الْكَبِيرَة"],
  Delta: ["capital delta", "دِلْتَا الْكَبِيرَة"],
  Theta: ["capital theta", "ثِيتَا الْكَبِيرَة"],
  Lambda: ["capital lambda", "لَامْدَا الْكَبِيرَة"],
  Sigma: ["capital sigma", "سِيجْمَا الْكَبِيرَة"],
  Phi: ["capital phi", "فَاي الْكَبِيرَة"],
  Psi: ["capital psi", "بْسَاي الْكَبِيرَة"],
  Omega: ["capital omega", "أُومِيجَا الْكَبِيرَة"],
};

const SYMBOL_COMMANDS: Record<string, string> = {
  pm: "pm",
  mp: "mp",
  times: "times",
  cdot: "times",
  ast: "times",
  div: "div",
  neq: "ne",
  ne: "ne",
  le: "le",
  leq: "le",
  leqslant: "le",
  ge: "ge",
  geq: "ge",
  geqslant: "ge",
  lt: "lt",
  gt: "gt",
  approx: "approx",
  equiv: "equiv",
  sim: "sim",
  simeq: "approx",
  cong: "cong",
  propto: "propto",
  to: "to",
  rightarrow: "to",
  longrightarrow: "to",
  mapsto: "to",
  Rightarrow: "implies",
  implies: "implies",
  Leftrightarrow: "iff",
  iff: "iff",
  in: "in",
  notin: "notin",
  subset: "subset",
  subseteq: "subset",
  cup: "cup",
  cap: "cap",
  emptyset: "emptyset",
  varnothing: "emptyset",
  infty: "infty",
  degree: "degree",
  circ: "compose",
  "%": "percent",
  angle: "angle",
  triangle: "triangle",
  perp: "perp",
  parallel: "parallel",
  cdots: "dots",
  ldots: "dots",
  dots: "dots",
  therefore: "therefore",
  because: "because",
  forall: "forall",
  exists: "exists",
  neg: "not",
  lnot: "not",
  land: "and",
  wedge: "and",
  lor: "or",
  vee: "or",
  prime: "prime",
};

const FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "log",
  "ln",
  "exp",
  "lim",
  "max",
  "min",
  "gcd",
  "det",
]);

const BIG = new Set(["sum", "prod", "int", "oint"]);

/** Commands that only space or size what follows. */
const QUIET = new Set([
  ",",
  ";",
  ":",
  "!",
  " ",
  "quad",
  "qquad",
  "displaystyle",
  "textstyle",
  "limits",
  "nolimits",
  "left",
  "right",
  "big",
  "Big",
  "bigg",
  "Bigg",
  "bigl",
  "bigr",
  "Bigl",
  "Bigr",
  "middle",
]);

/** Commands whose braced argument is plain words, said as written. */
const WORDY = new Set([
  "text",
  "textrm",
  "textit",
  "textbf",
  "mathrm",
  "operatorname",
  "mbox",
]);

/** Commands that only style their argument, whose content is said. */
const STYLES = new Set([
  "mathbf",
  "mathit",
  "mathsf",
  "mathtt",
  "boldsymbol",
  "bm",
  "mathcal",
  "mathscr",
]);

const ACCENTS: Record<string, string> = {
  vec: "vector",
  overrightarrow: "vector",
  overline: "segment",
  bar: "bar",
  hat: "hat",
  widehat: "hat",
};

const CHARACTERS: Record<string, string> = {
  "+": "plus",
  "=": "eq",
  "<": "lt",
  ">": "gt",
  "×": "times",
  "·": "times",
  "*": "times",
  "÷": "div",
  "/": "div",
  "±": "pm",
  "≠": "ne",
  "≤": "le",
  "≥": "ge",
  "≈": "approx",
  "∞": "infty",
  "°": "degree",
  "%": "percent",
  "!": "factorial",
  ",": "comma",
  ":": "ratio",
  "'": "prime",
  "∠": "angle",
  "△": "triangle",
  "⊥": "perp",
  "∥": "parallel",
  "→": "to",
  "∈": "in",
  "∪": "cup",
  "∩": "cap",
};

const DIGIT = /[\d٠-٩۰-۹]/u;
const NUMBER = /^[\d٠-٩۰-۹]+(?:(?:\.|\{,\}|٫)[\d٠-٩۰-۹]+)?/u;

function tokenize(latex: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < latex.length) {
    const rest = latex.slice(at);
    const character = rest[0] ?? "";
    if (/\s/u.test(character) || character === "~") {
      at += 1;
      continue;
    }
    if (
      DIGIT.test(character) ||
      (character === "." && DIGIT.test(rest[1] ?? ""))
    ) {
      const number =
        NUMBER.exec(rest)?.[0] ?? /^\.\d+/u.exec(rest)?.[0] ?? character;
      tokens.push({ kind: "num", text: number.replace("{,}", ".") });
      at += number.length;
      continue;
    }
    if (character === "\\") {
      const name = /^\\([A-Za-z]+|.)/su.exec(rest)?.[1] ?? "";
      at += name.length + 1;
      if (!name || QUIET.has(name)) continue;
      if (WORDY.has(name)) {
        const words = /^\s*\{([^{}]*)\}/u.exec(latex.slice(at));
        if (words) {
          at += words[0].length;
          tokens.push({ kind: "command", name: `text:${words[1] ?? ""}` });
          continue;
        }
      }
      tokens.push({ kind: "command", name });
      continue;
    }
    if (/\p{L}/u.test(character)) {
      tokens.push({ kind: "letter", text: character });
      at += 1;
      continue;
    }
    tokens.push({ kind: "char", value: character === "−" ? "-" : character });
    at += 1;
  }
  return tokens;
}

const CLOSERS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "\\{": "\\}",
  "|": "|",
};

class Reader {
  at = 0;
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

  isCommand(name: string): boolean {
    const token = this.peek();
    return token?.kind === "command" && token.name === name;
  }

  /** Whether the next token closes a group opened with `open`. */
  closes(open: string | null): boolean {
    if (open === null) return false;
    const close = CLOSERS[open];
    if (close === "\\}") return this.isCommand("}");
    return close !== undefined && this.isChar(close);
  }
}

/** A run of nodes up to the token that closes `open`, or to the end. */
function sequence(reader: Reader, open: string | null): Node[] {
  const nodes: Node[] = [];
  while (reader.peek() && !reader.closes(open)) {
    const node = atom(reader);
    if (node) nodes.push(...scripts(reader, node));
  }
  return nodes;
}

/** A braced argument, or a single token as LaTeX takes one. */
function argument(reader: Reader): Node[] {
  if (reader.isChar("{")) {
    reader.next();
    const inner = sequence(reader, "{");
    reader.next();
    return inner;
  }
  const token = reader.peek();
  // x^23 is x squared, then 3: a script takes one digit.
  if (
    token?.kind === "num" &&
    token.text.length > 1 &&
    /^\d+$/u.test(token.text)
  ) {
    const digit = token.text.slice(0, 1);
    token.text = token.text.slice(1);
    return [{ kind: "num", text: digit }];
  }
  const node = atom(reader);
  return node ? [node] : [];
}

function scripts(reader: Reader, base: Node): Node[] {
  let sup: Node[] | null = null;
  let sub: Node[] | null = null;
  while (reader.isChar("^") || reader.isChar("_") || reader.isChar("'")) {
    const token = reader.next();
    if (token?.kind === "char" && token.value === "'") {
      sup = [...(sup ?? []), { kind: "sym", name: "prime" }];
      continue;
    }
    const value = argument(reader);
    if (token?.kind === "char" && token.value === "^") sup = value;
    else sub = value;
  }
  return sup || sub ? [{ kind: "script", base, sup, sub }] : [base];
}

function atom(reader: Reader): Node | null {
  const token = reader.next();
  if (!token) return null;
  if (token.kind === "num") return { kind: "num", text: token.text };
  if (token.kind === "letter") return { kind: "id", text: token.text };
  if (token.kind === "char") {
    const { value } = token;
    if (value === "(" || value === "[" || value === "|") {
      const body = sequence(reader, value);
      reader.next();
      return { kind: "fence", open: value, body };
    }
    if (value === "{") {
      const body = sequence(reader, "{");
      reader.next();
      return body.length === 1 && body[0]
        ? body[0]
        : { kind: "fence", open: "group", body };
    }
    if (value === "-") return { kind: "sym", name: "minus" };
    if (value === "&") return { kind: "sym", name: "comma" };
    const name = CHARACTERS[value];
    return name ? { kind: "sym", name } : null;
  }
  const { name } = token;
  if (name.startsWith("text:"))
    return { kind: "words", text: name.slice("text:".length) };
  if (name === "\\") return { kind: "sym", name: "row" };
  if (name === "{") {
    const body = sequence(reader, "\\{");
    reader.next();
    return { kind: "fence", open: "\\{", body };
  }
  if (name === "|" || name === "vert" || name === "lvert") {
    const body: Node[] = [];
    while (
      reader.peek() &&
      !reader.isCommand("|") &&
      !reader.isCommand("rvert") &&
      !reader.isCommand("vert")
    ) {
      const node = atom(reader);
      if (node) body.push(...scripts(reader, node));
    }
    reader.next();
    return { kind: "fence", open: "|", body };
  }
  if (
    name === "frac" ||
    name === "dfrac" ||
    name === "tfrac" ||
    name === "cfrac"
  ) {
    const top = argument(reader);
    return { kind: "frac", top, bottom: argument(reader) };
  }
  if (name === "sqrt") {
    let index: Node[] | null = null;
    if (reader.isChar("[")) {
      reader.next();
      index = sequence(reader, "[");
      reader.next();
    }
    return { kind: "root", index, body: argument(reader) };
  }
  if (name === "begin" || name === "end") {
    argument(reader);
    return null;
  }
  if (ACCENTS[name])
    return { kind: "accent", name: ACCENTS[name], body: argument(reader) };
  if (STYLES.has(name)) {
    const body = argument(reader);
    return body.length === 1 && body[0]
      ? body[0]
      : { kind: "fence", open: "group", body };
  }
  if (name === "mathbb") {
    const body = argument(reader);
    const [only] = body;
    return only?.kind === "id" && WORDS[only.text]
      ? { kind: "sym", name: only.text }
      : (only ?? null);
  }
  if (SYMBOL_COMMANDS[name])
    return { kind: "sym", name: SYMBOL_COMMANDS[name] };
  if (FUNCTIONS.has(name)) return { kind: "fn", name };
  if (BIG.has(name))
    return { kind: "big", name: name === "oint" ? "int" : name };
  if (GREEK[name]) return { kind: "id", text: `\\${name}` };
  if (name === "lbrace") {
    const body = sequence(reader, "\\{");
    reader.next();
    return { kind: "fence", open: "\\{", body };
  }
  if (name === "lparen" || name === "lbrack") {
    const open = name === "lparen" ? "(" : "[";
    const body = sequence(reader, open);
    reader.next();
    return { kind: "fence", open, body };
  }
  // A command this does not know is said by its name, as a reader would.
  return /^[A-Za-z]+$/u.test(name) ? { kind: "words", text: name } : null;
}

const RELATIONS = new Set([
  "eq",
  "ne",
  "lt",
  "gt",
  "le",
  "ge",
  "approx",
  "equiv",
  "sim",
  "cong",
  "propto",
  "to",
  "implies",
  "iff",
  "in",
  "notin",
  "subset",
  "plus",
  "minus",
  "pm",
  "mp",
  "times",
  "div",
  "comma",
  "ratio",
  "row",
]);

/** Whether a part reads as one word, so it needs no "end" after it. */
const simple = (nodes: readonly Node[]) =>
  nodes.length === 1 &&
  (nodes[0]?.kind === "num" ||
    nodes[0]?.kind === "id" ||
    nodes[0]?.kind === "words");

class Speaker {
  constructor(
    readonly language: MathLanguage,
    /** Whether the formula is drawn in Arabic notation, its x as س. */
    readonly arabicNotation = false,
  ) {}

  word(name: string): string {
    const pair = WORDS[name];
    return pair ? pair[this.language === "ar" ? 1 : 0] : name;
  }

  say(nodes: readonly Node[], approaching = false): string[] {
    const words: string[] = [];
    nodes.forEach((node, index) => {
      const before = nodes[index - 1];
      if (node.kind === "sym" && node.name === "minus") {
        const unary =
          !before || (before.kind === "sym" && RELATIONS.has(before.name));
        words.push(this.word(unary ? "negative" : "minus"));
        return;
      }
      if (node.kind === "sym" && node.name === "to" && approaching) {
        words.push(this.word("approaches"));
        return;
      }
      words.push(...this.node(node));
    });
    return words;
  }

  /** Words that close a part read aloud, unless it was one word. */
  ending(nodes: readonly Node[], end: string): string[] {
    return simple(nodes) ? [] : [this.word(end)];
  }

  node(node: Node): string[] {
    switch (node.kind) {
      case "num":
      case "words":
        return [node.text];
      case "id": {
        const drawn =
          this.language === "ar" && this.arabicNotation
            ? arabicLetter(node.text === "\\pi" ? "π" : node.text)
            : undefined;
        const greek = GREEK[node.text.slice(1)];
        return [
          drawn ??
            (greek && node.text.startsWith("\\")
              ? greek[this.language === "ar" ? 1 : 0]
              : node.text),
        ];
      }
      case "sym":
      case "fn":
        return [this.word(node.name)];
      case "big":
        return [this.word(node.name)];
      case "frac":
        return simple(node.top) && simple(node.bottom)
          ? [...this.say(node.top), this.word("over"), ...this.say(node.bottom)]
          : [
              this.word("fraction"),
              ...this.say(node.top),
              this.word("denominator"),
              ...this.say(node.bottom),
            ];
      case "root": {
        const index = node.index ?? [];
        const [only] = index;
        const lead =
          index.length === 0 ||
          (only?.kind === "num" && only.text === "2" && index.length === 1)
            ? [this.word("squareRoot")]
            : only?.kind === "num" && only.text === "3" && index.length === 1
              ? [this.word("cubeRoot")]
              : [
                  this.word("rootOf"),
                  ...this.say(index),
                  this.word("rootIndexOf"),
                ];
        return [
          ...lead,
          ...this.say(node.body),
          ...this.ending(node.body, "endRoot"),
        ];
      }
      case "fence":
        if (node.open === "group") return this.say(node.body);
        if (node.open === "|")
          return [
            this.word("abs"),
            ...this.say(node.body),
            ...this.ending(node.body, "endAbs"),
          ];
        return node.open === "\\{"
          ? [
              this.word("openBrace"),
              ...this.say(node.body),
              this.word("closeBrace"),
            ]
          : [this.word("open"), ...this.say(node.body), this.word("close")];
      case "accent":
        return node.name === "vector" || node.name === "segment"
          ? [this.word(node.name), ...this.say(node.body)]
          : [...this.say(node.body), this.word(node.name)];
      case "script":
        return this.script(node);
    }
    return [];
  }

  script(node: Extract<Node, { kind: "script" }>): string[] {
    const { base, sup, sub } = node;
    if (base.kind === "big") {
      const limits =
        sub && sup
          ? [
              this.word("from"),
              ...this.say(sub),
              this.word("to"),
              ...this.say(sup),
            ]
          : sub
            ? [this.word("from"), ...this.say(sub)]
            : [];
      return [this.word(base.name), ...limits, this.word("of")];
    }
    if (base.kind === "fn" && base.name === "lim" && sub)
      return [
        this.word("lim"),
        this.word("as"),
        ...this.say(sub, true),
        this.word("of"),
      ];
    const words: string[] = [];
    if (
      base.kind === "fn" &&
      sup?.length === 2 &&
      sup[0]?.kind === "sym" &&
      sup[0].name === "minus" &&
      sup[1]?.kind === "num" &&
      sup[1].text === "1"
    )
      return [this.word("inverse"), this.word(base.name)];
    words.push(...this.node(base));
    if (sub && base.kind === "fn" && base.name === "log")
      words.push(this.word("base"), ...this.say(sub), this.word("of"));
    else if (sub) {
      if (this.language === "en") words.push(this.word("sub"));
      words.push(...this.say(sub));
    }
    if (sup) words.push(...this.power(sup));
    return words;
  }

  power(sup: readonly Node[]): string[] {
    const [only] = sup;
    if (sup.length === 1 && only?.kind === "num" && only.text === "2")
      return [this.word("squared")];
    if (sup.length === 1 && only?.kind === "num" && only.text === "3")
      return [this.word("cubed")];
    // x′ is x prime, and 30^\circ thirty degrees.
    const marks = sup.flatMap((node) =>
      node.kind === "sym" && node.name === "prime"
        ? ["prime"]
        : node.kind === "sym" &&
            (node.name === "degree" || node.name === "compose")
          ? ["degree"]
          : [],
    );
    if (marks.length === sup.length)
      return marks.map((name) => this.word(name));
    return [
      this.word("power"),
      ...this.say(sup),
      ...this.ending(sup, "endPower"),
    ];
  }
}

/**
 * One formula in LaTeX as the words a voice says for it; in Arabic notation
 * its letters as they are drawn, x as س.
 */
export function spokenMath(
  latex: string,
  language: MathLanguage,
  arabicNotation = false,
): string {
  const nodes = sequence(new Reader(tokenize(latex)), null);
  return new Speaker(language, arabicNotation)
    .say(nodes)
    .filter(Boolean)
    .join(" ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/** Text with its \(…\) and \[…\] formulas said in words, for a voice or a label. */
export function spokenMathText(text: string, language: MathLanguage): string {
  return mathRuns(text)
    .map((run) =>
      "latex" in run
        ? ` ${spokenMath(run.latex, language, run.rtl)} `
        : run.text,
    )
    .join("")
    .replaceAll(/ {2,}/gu, " ")
    .trim();
}

/** The words of a text outside its formulas, which say what language it is in. */
export const wordsOutsideMath = (text: string) =>
  mathRuns(text)
    .map((run) => ("latex" in run ? " " : run.text))
    .join("");

/**
 * The language a text with formulas is said in: that of its words, else
 * Arabic for a formula set in Arabic notation, else the reader's own.
 */
export function mathTextLanguage(
  text: string,
  fallback: MathLanguage,
): MathLanguage {
  const direction = textDirection(wordsOutsideMath(text));
  if (direction) return direction === "rtl" ? "ar" : "en";
  return mathRuns(text).some((run) => "latex" in run && run.rtl)
    ? "ar"
    : fallback;
}
