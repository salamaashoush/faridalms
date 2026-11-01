import { parseSync } from "vite";

export interface Source {
  path: string;
  text: string;
}

/** Where the API, its stores and the domain raise the codes a client receives. */
export const API_ROOTS = [
  "apps/api/src/",
  "packages/database/src/",
  "packages/domain/src/",
];
/** Where the web raises codes of its own into the same reader. */
export const WEB_ROOTS = ["apps/web/src/", "packages/editor/src/"];
export const READER = "apps/web/src/utils/error.ts";
export const VALIDATION_READER = "apps/web/src/utils/validation.ts";

const CODE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const OPEN_CODE = /^[a-z][a-z0-9_]*\.[a-z0-9_]*$/;
const PARAMETRISED = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*:$/;
const SUFFIX = /^\.[a-z][a-z0-9_]*$/;
// File and host names share the shape of a code.
const NAME =
  /\.(?:html|css|js|mjs|json|xml|txt|py|wasm|vtt|m3u8|jpg|png|svg|zip|com|org|be|aspx)$/;
// Values of these properties are audit actions, tables and job names, and
// a constant named for tables holds table names.
const NOT_CODE_KEYS = new Set(["action", "audit", "name", "table"]);
const TABLES = /TABLES?$/;
const COMPARISONS = new Set(["===", "!==", "==", "!="]);
const PASS_THROUGH = new Set([
  "ConditionalExpression",
  "LogicalExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
]);

interface Node {
  type: string;
  start: number;
  [key: string]: unknown;
}

const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

function walk(root: Node, visit: (node: Node, parents: Node[]) => void) {
  const parents: Node[] = [];
  const enter = (node: Node) => {
    visit(node, parents);
    parents.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "type") continue;
      if (Array.isArray(value)) {
        for (const item of value) if (isNode(item)) enter(item);
      } else if (isNode(value)) enter(value);
    }
    parents.pop();
  };
  enter(root);
}

function parse(source: Source): Node {
  const result = parseSync(source.path, source.text, {
    lang: source.path.endsWith("x") ? "tsx" : "ts",
  });
  const [failure] = result.errors;
  if (failure) throw new Error(`${source.path}: ${failure.message}`);
  return result.program as unknown as Node;
}

const keyName = (node: unknown): string | null =>
  isNode(node)
    ? node.type === "Identifier"
      ? String(node.name)
      : node.type === "Literal"
        ? String(node.value)
        : null
    : null;

/** True when the literal is read, named or compared rather than raised. */
function consumed(node: Node, parents: Node[]): boolean {
  if (
    parents.some(
      (parent) =>
        parent.type === "VariableDeclarator" &&
        TABLES.test(keyName(parent.id) ?? ""),
    )
  )
    return true;
  let child = node;
  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const parent = parents[index];
    if (!parent) return false;
    if (parent.type === "TaggedTemplateExpression") return true;
    if (parent.type === "SwitchCase") return parent.test === child;
    if (parent.type === "BinaryExpression")
      return COMPARISONS.has(String(parent.operator));
    if (parent.type === "Property") {
      if (parent.key === child) return true;
      return NOT_CODE_KEYS.has(keyName(parent.key) ?? "");
    }
    if (
      parent.type === "ImportDeclaration" ||
      parent.type === "ExportNamedDeclaration" ||
      parent.type === "ExportAllDeclaration" ||
      parent.type === "ImportExpression"
    )
      return true;
    if (parent.type === "ConditionalExpression" && parent.test === child)
      return false;
    if (!PASS_THROUGH.has(parent.type)) return false;
    child = parent;
  }
  return false;
}

export interface Raised {
  /** Each code written as a literal, with the first place it appears. */
  codes: Map<string, string>;
  /** `area.reason:` followed by a value, such as a date. */
  parametrised: Map<string, string>;
  /** `<table>.reason` for any table, as the database mapping builds them. */
  suffixes: Map<string, string>;
  /** Places that assemble a code from a variable, with the code's start. */
  assembled: Map<string, string>;
}

export function raisedCodes(sources: readonly Source[]): Raised {
  const raised: Raised = {
    codes: new Map(),
    parametrised: new Map(),
    suffixes: new Map(),
    assembled: new Map(),
  };
  for (const source of sources) {
    const lineOf = (offset: number) =>
      `${source.path}:${source.text.slice(0, offset).split("\n").length}`;
    const note = (into: Map<string, string>, key: string, offset: number) => {
      if (!into.has(key)) into.set(key, lineOf(offset));
    };
    walk(parse(source), (node, parents) => {
      if (node.type === "Literal" && typeof node.value === "string") {
        const parent = parents.at(-1);
        if (
          parent?.type === "BinaryExpression" &&
          parent.operator === "+" &&
          parent.left === node &&
          OPEN_CODE.test(node.value)
        ) {
          raised.assembled.set(lineOf(node.start), node.value);
          return;
        }
        if (
          CODE.test(node.value) &&
          !NAME.test(node.value) &&
          !consumed(node, parents)
        )
          note(raised.codes, node.value, node.start);
        return;
      }
      if (node.type !== "TemplateLiteral") return;
      const quasis = (node.quasis as Node[]).map(
        (quasi) => (quasi.value as { cooked: string | null }).cooked ?? "",
      );
      const [head = "", ...rest] = quasis;
      if (consumed(node, parents)) return;
      if (quasis.length === 1) {
        if (CODE.test(head) && !NAME.test(head))
          note(raised.codes, head, node.start);
        return;
      }
      const tail = rest.at(-1) ?? "";
      if (
        head === "" &&
        quasis.length === 2 &&
        SUFFIX.test(tail) &&
        !NAME.test(tail)
      )
        note(raised.suffixes, tail, node.start);
      if (rest.some((quasi) => quasi !== "")) return;
      if (PARAMETRISED.test(head)) note(raised.parametrised, head, node.start);
      else if (OPEN_CODE.test(head))
        raised.assembled.set(lineOf(node.start), head);
    });
  }
  return raised;
}

export interface Handled {
  /** Codes with a case of their own, and the file the case is in. */
  cases: Map<string, string>;
  /** Codes no person can act on, read as the generic error. */
  internal: Set<string>;
  /** Prefixes read with `startsWith`, and suffixes read with `endsWith`. */
  prefixes: Set<string>;
  suffixes: Set<string>;
}

/**
 * What the reader handles: its `case` labels, the codes in its
 * `INTERNAL_CODES` set, and the strings it tests with `startsWith` and
 * `endsWith`, directly or through a constant. The validation reader adds the
 * `validation.*` cases the reader hands it.
 */
export function handledCodes(reader: Source, validation: Source): Handled {
  const handled: Handled = {
    cases: new Map(),
    internal: new Set(),
    prefixes: new Set(),
    suffixes: new Set(),
  };
  const constants = new Map<string, string>();
  const tests: { method: string; argument: Node }[] = [];
  walk(parse(reader), (node) => {
    if (node.type === "VariableDeclarator" && isNode(node.init)) {
      const name = keyName(node.id);
      const init = node.init;
      if (init.type === "Literal" && typeof init.value === "string" && name)
        constants.set(name, init.value);
      if (name === "INTERNAL_CODES")
        walk(init, (item) => {
          if (item.type === "Literal" && typeof item.value === "string")
            handled.internal.add(item.value);
        });
    }
    if (node.type === "SwitchCase" && isNode(node.test)) {
      const test = node.test;
      if (test.type === "Literal" && typeof test.value === "string")
        handled.cases.set(test.value, reader.path);
    }
    if (node.type === "CallExpression" && isNode(node.callee)) {
      const callee = node.callee;
      const method =
        callee.type === "MemberExpression" ? keyName(callee.property) : null;
      const [argument] = node.arguments as unknown[];
      if (
        (method === "startsWith" || method === "endsWith") &&
        isNode(argument)
      )
        tests.push({ method, argument });
    }
  });
  for (const { method, argument } of tests) {
    const value =
      argument.type === "Literal"
        ? String(argument.value)
        : argument.type === "Identifier"
          ? constants.get(String(argument.name))
          : undefined;
    if (value === undefined) continue;
    (method === "startsWith" ? handled.prefixes : handled.suffixes).add(value);
  }
  walk(parse(validation), (node) => {
    if (node.type !== "SwitchCase" || !isNode(node.test)) return;
    const test = node.test;
    if (
      test.type === "Literal" &&
      typeof test.value === "string" &&
      test.value.startsWith("validation.")
    )
      handled.cases.set(test.value, validation.path);
  });
  return handled;
}

const under = (path: string, roots: readonly string[]) =>
  roots.some((root) => path.startsWith(root));
const TESTS = /\.(?:test|spec)\.tsx?$|\/test\//;

/**
 * Every code the API can raise to a client must be read in the person's
 * language by `getMessageFromError`, and every code it reads must still be
 * raised by the API or the web. Returns one line per problem.
 */
export function errorCodeProblems(sources: readonly Source[]): string[] {
  const find = (path: string) => {
    const found = sources.find((source) => source.path === path);
    if (!found) throw new Error(`${path} is missing`);
    return found;
  };
  const handled = handledCodes(find(READER), find(VALIDATION_READER));
  const live = (roots: readonly string[]) =>
    sources.filter(
      (source) =>
        under(source.path, roots) &&
        !TESTS.test(source.path) &&
        source.path !== READER &&
        source.path !== VALIDATION_READER,
    );
  const api = raisedCodes(live(API_ROOTS));
  const web = raisedCodes(live(WEB_ROOTS));
  const problems: string[] = [];
  const how = `in ${READER}: add a case that returns copy from messages/en.json and messages/ar.json, or list it in INTERNAL_CODES if no person can act on it`;

  for (const [code, at] of api.codes) {
    const isCase = handled.cases.has(code);
    const isInternal = handled.internal.has(code);
    if (isCase && isInternal)
      problems.push(
        `${code} has a case and is in INTERNAL_CODES in ${READER}: keep one`,
      );
    else if (!isCase && !isInternal)
      problems.push(`${code} (raised at ${at}) is not read ${how}`);
  }
  for (const [prefix, at] of api.parametrised)
    if (!handled.prefixes.has(prefix))
      problems.push(
        `${prefix}… (raised at ${at}) is not read in ${READER}: add a startsWith branch for it`,
      );
  for (const [suffix, at] of api.suffixes)
    if (!handled.suffixes.has(suffix))
      problems.push(
        `…${suffix} (raised at ${at}) is not read in ${READER}: add an endsWith branch for it`,
      );
  for (const [at, head] of api.assembled)
    problems.push(
      `${at} assembles a code from "${head}" and a variable: write each code as a literal, so this check can see it`,
    );

  const raised = (code: string) =>
    api.codes.has(code) ||
    web.codes.has(code) ||
    [...api.parametrised.keys()].some((prefix) => code.startsWith(prefix));
  for (const [code, path] of [
    ...handled.cases,
    ...[...handled.internal].map((internal) => [internal, READER] as const),
  ])
    if (CODE.test(code) && !raised(code))
      problems.push(
        `${code} is read in ${path} but nothing raises it: remove it and the copy only it uses`,
      );
  for (const prefix of handled.prefixes)
    if (PARAMETRISED.test(prefix) && !api.parametrised.has(prefix))
      problems.push(
        `${prefix}… is read in ${READER} but nothing raises it: remove its branch and the copy only it uses`,
      );
  for (const suffix of handled.suffixes)
    if (SUFFIX.test(suffix) && !api.suffixes.has(suffix))
      problems.push(
        `…${suffix} is read in ${READER} but nothing raises it: remove its branch and the copy only it uses`,
      );
  return problems;
}
