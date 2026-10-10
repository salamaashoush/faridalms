import type { Node } from "acorn";

import { parse } from "acorn";
import { simple } from "acorn-walk";

/** How long one loop may keep a page busy before it is stopped. */
export const LOOP_SECONDS = 3;

/** What a page's stopped loop throws, recognised when it is reported. */
export const LOOP_STOPPED = "farida:loop";

/**
 * What a browser says of an error it will not describe. Safari tells a
 * page with no origin of its own nothing else about a script that failed.
 */
export const ERROR_HIDDEN = "Script error.";

const CHECK = "__faridaLoop();";
const NOTE = "}catch(e){__faridaErr(e);throw e}";

/**
 * Text put into a script without replacing any of it. What closes at a
 * place comes before what opens there, the innermost closing first and
 * the outermost opening first, so brackets put around nested code nest.
 */
interface Edit {
  at: number;
  text: string;
  closes: boolean;
  /** The length of the code the edit is put around. */
  span: number;
}

type Around = { start: number; end: number };

function applied(code: string, edits: Edit[]): string {
  const ordered = edits.toSorted(
    (a, b) =>
      a.at - b.at ||
      Number(b.closes) - Number(a.closes) ||
      (a.closes ? a.span - b.span : b.span - a.span),
  );
  let out = "";
  let from = 0;
  for (const edit of ordered) {
    out += code.slice(from, edit.at) + edit.text;
    from = edit.at;
  }
  return out + code.slice(from);
}

const around = (
  edits: Edit[],
  node: Around,
  open: string,
  close: string,
  span = node.end - node.start,
) => {
  edits.push(
    { at: node.start, text: open, closes: false, span },
    { at: node.end, text: close, closes: true, span },
  );
};

type Body = Node & { body: Node[] };
type Fn = Node & { body: Node; expression?: boolean };
type Declared = Node & {
  kind: string;
  declarations: (Node & { init: Node | null })[];
};

const isDirective = (node: Node) =>
  node.type === "ExpressionStatement" && "directive" in node;

const FUNCTIONS = new Set([
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassExpression",
]);

/**
 * Has a script note every error it meets before the error goes on its way,
 * for a browser that would otherwise report nothing of it: around the code
 * of each function, and around each statement the script itself runs.
 * Nothing a script declares moves, so what one script declares another
 * still finds, and a constant stays one.
 */
function noteErrors(tree: Body, edits: Edit[]) {
  const inFunction = (node: Node) => {
    const fn = node as Fn;
    if (fn.body.type !== "BlockStatement") {
      // An arrow that is one expression gets a body to note errors in.
      around(edits, fn.body, "{try{return (", `)${NOTE}}`);
      return;
    }
    const block = fn.body as Body;
    // A directive works only as the first thing a function says.
    const said = block.body.filter(isDirective).at(-1);
    const from = said ? said.end : block.start + 1;
    // A body with nothing to run has nothing to note.
    if (block.body.at(-1) === said) return;
    const span = block.end - block.start;
    edits.push(
      { at: from, text: "try{", closes: false, span },
      { at: block.end - 1, text: NOTE, closes: true, span },
    );
  };
  simple(tree, {
    FunctionDeclaration: inFunction,
    FunctionExpression: inFunction,
    ArrowFunctionExpression: inFunction,
  });
  for (const statement of tree.body) {
    if (
      isDirective(statement) ||
      statement.type === "FunctionDeclaration" ||
      statement.type === "ClassDeclaration" ||
      statement.type === "EmptyStatement"
    )
      continue;
    const declared = statement as Declared;
    if (statement.type === "VariableDeclaration" && declared.kind !== "var") {
      // Wrapped whole, a constant would be known only inside the wrapping.
      for (const { init } of declared.declarations)
        if (init && !FUNCTIONS.has(init.type))
          around(edits, init, "__faridaTry(()=>(", "))");
      continue;
    }
    around(edits, statement, "try{", NOTE);
  }
}

/** Why a script cannot be read, as its parser says it, and on which of its lines. */
export interface Unreadable {
  message: string;
  line: number;
}

/**
 * A script with a check at the top of every loop's body, so a loop that
 * never ends throws instead of freezing the page. Nothing is added on a new
 * line, so errors still name the lines the student wrote. A script that
 * does not parse is left alone for the browser to report; where the browser
 * reports nothing, `trace` has the script say so itself, and note its own
 * errors as it runs.
 */
export function guardedScript(
  code: string,
  module: boolean,
  trace: ((problem: Unreadable) => string) | null = null,
): string {
  let tree: Node;
  try {
    tree = parse(code, {
      ecmaVersion: "latest",
      sourceType: module ? "module" : "script",
      allowReturnOutsideFunction: !module,
      // An arrow's parentheses are part of what it gives back.
      preserveParens: true,
    });
  } catch (error) {
    const at = (error as { loc?: { line: number } }).loc;
    if (!trace || !(error instanceof SyntaxError) || !at) return code;
    return trace({
      message: error.message.replace(/\s*\(\d+:\d+\)$/, ""),
      line: at.line,
    });
  }
  const edits: Edit[] = [];
  const guard = ({ body }: { body: Node }) => {
    const span = body.end - body.start;
    if (body.type === "BlockStatement")
      edits.push({ at: body.start + 1, text: CHECK, closes: false, span });
    else around(edits, body, `{${CHECK}`, "}");
  };
  simple(tree, {
    WhileStatement: guard,
    DoWhileStatement: guard,
    ForStatement: guard,
    ForInStatement: guard,
    ForOfStatement: guard,
  });
  // A module's errors are reported by every browser.
  if (trace && !module) noteErrors(tree as Body, edits);
  return applied(code, edits);
}

// Sends what the page writes to its console, and the errors it meets, to
// the lesson around it, and keeps the loop check. An error the browser
// will not describe is the one the page last noted, when it noted one. An
// error that arrives as a refused promise has no line of its own in Chrome,
// so it is read from where the error says it was made. A
// link is not followed, since the frame has nowhere to go, but told to the
// lesson, which may have the page it names. One line, so the page's own
// lines keep their numbers.
const PRELUDE = `<script>(()=>{const show=(v)=>{if(typeof v==="string")return v;if(v instanceof Error)return v.name+": "+v.message;try{return JSON.stringify(v)??String(v)}catch{return String(v)}};const send=(kind,text,line)=>parent.postMessage({type:"console",kind,text,line:line??null},"*");const lineOf=(v)=>{if(!(v instanceof Error))return null;const told=v.line??v.lineNumber;if(told)return told;const at=/about:srcdoc:(\\d+):\\d+/.exec(String(v.stack));return at?Number(at[1]):null};for(const kind of ["log","info","warn","error","debug"]){const own=console[kind].bind(console);console[kind]=(...values)=>{send(kind==="debug"?"log":kind,values.map(show).join(" "));own(...values)}}let noted=null;window.__faridaErr=(error)=>{noted=error};window.__faridaTry=(run)=>{try{return run()}catch(error){noted=error;throw error}};window.__faridaSay=(text,line)=>send("error",text,line);addEventListener("error",(event)=>{const hidden=event.message==="${ERROR_HIDDEN}"&&!event.lineno;const known=hidden?noted:null;noted=null;if(known)send("error",show(known),lineOf(known));else send("error",String(event.message),event.lineno||null)});addEventListener("unhandledrejection",(event)=>send("error",show(event.reason),lineOf(event.reason)));addEventListener("click",(event)=>{const link=event.target instanceof Element?event.target.closest("a[href]"):null;const href=link?link.getAttribute("href")||"":"#";if(href.startsWith("#"))return;event.preventDefault();parent.postMessage({type:"open",href},"*")});let started=0;window.__faridaLoop=()=>{if(!started){started=Date.now();queueMicrotask(()=>{started=0})}else if(Date.now()-started>${LOOP_SECONDS * 1000}){started=0;throw new Error("${LOOP_STOPPED}")}}})()</script>`;

const SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi;
const SOURCE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/**
 * The libraries the files host serves to a played page, by the names a
 * page may ask for one by. A page reaches no other server, so a library
 * is loaded from beside the page that plays it.
 */
const LIBRARIES: Record<string, string> = {
  "p5.js": "/play/lib/p5.min.js",
  "p5.min.js": "/play/lib/p5.min.js",
};

const newlines = (text: string) => text.split("\n").length - 1;

/**
 * A student's page ready to play: its console reported, its loops guarded.
 * For a browser that hides a page's errors from it, `traced` has the
 * page's scripts note their own.
 */
export function playablePage(html: string, traced = false): string {
  const scripts = html.replace(
    SCRIPT,
    (whole, attributes: string | undefined, code: string, offset: number) => {
      const kind = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes ?? "")?.[1];
      const module = kind?.toLowerCase() === "module";
      const source = SOURCE.exec(attributes ?? "");
      if (source) {
        const named = (source[1] ?? source[2] ?? source[3] ?? "")
          .replace(/^\.\//, "")
          .toLowerCase();
        const library = LIBRARIES[named];
        // Read as shared, so the page is still told of an error inside it.
        return library
          ? `<script${(attributes ?? "").replace(SOURCE, `src="${library}" crossorigin="anonymous"`)}></script>`
          : whole;
      }
      if (kind && !module && !/javascript|ecmascript/i.test(kind)) return whole;
      const open = `<script${attributes ?? ""}>`;
      // The page's line the script's first line is on.
      const first = 1 + newlines(html.slice(0, offset) + open);
      const guarded = guardedScript(
        code,
        module,
        traced
          ? ({ message, line }) =>
              // The script says why it cannot be read, in as many lines
              // as it had, so the scripts after it keep theirs.
              `__faridaSay(${JSON.stringify(`SyntaxError: ${message}`)},${first + line - 1})${"\n".repeat(newlines(code))}`
          : null,
      );
      return `${open}${guarded}</script>`;
    },
  );
  const doctype = /^\s*<!doctype[^>]*>/i.exec(scripts)?.[0] ?? "";
  // Before the doctype the page would fall back to quirks mode.
  return doctype + PRELUDE + scripts.slice(doctype.length);
}
