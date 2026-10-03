import type { Node } from "acorn";

import { parse } from "acorn";
import { simple } from "acorn-walk";

/** How long one loop may keep a page busy before it is stopped. */
export const LOOP_SECONDS = 3;

/** What a page's stopped loop throws, recognised when it is reported. */
export const LOOP_STOPPED = "farida:loop";

const CHECK = "__faridaLoop();";

/**
 * A script with a check at the top of every loop's body, so a loop that
 * never ends throws instead of freezing the page. Nothing is added on a new
 * line, so errors still name the lines the student wrote. A script that
 * does not parse is left alone for the browser to report.
 */
export function guardedScript(code: string, module: boolean): string {
  let tree: Node;
  try {
    tree = parse(code, {
      ecmaVersion: "latest",
      sourceType: module ? "module" : "script",
      allowReturnOutsideFunction: !module,
    });
  } catch {
    return code;
  }
  const edits: { at: number; text: string }[] = [];
  const guard = ({ body }: { body: Node }) => {
    if (body.type === "BlockStatement")
      edits.push({ at: body.start + 1, text: CHECK });
    else
      edits.push(
        { at: body.start, text: `{${CHECK}` },
        { at: body.end, text: "}" },
      );
  };
  simple(tree, {
    WhileStatement: guard,
    DoWhileStatement: guard,
    ForStatement: guard,
    ForInStatement: guard,
    ForOfStatement: guard,
  });
  return edits
    .toSorted((a, b) => b.at - a.at)
    .reduce(
      (text, edit) => text.slice(0, edit.at) + edit.text + text.slice(edit.at),
      code,
    );
}

// Sends what the page writes to its console, and the errors it meets, to
// the lesson around it, and keeps the loop check. One line, so the page's
// own lines keep their numbers.
const PRELUDE = `<script>(()=>{const show=(v)=>{if(typeof v==="string")return v;if(v instanceof Error)return v.name+": "+v.message;try{return JSON.stringify(v)??String(v)}catch{return String(v)}};const send=(kind,text,line)=>parent.postMessage({type:"console",kind,text,line:line??null},"*");for(const kind of ["log","info","warn","error","debug"]){const own=console[kind].bind(console);console[kind]=(...values)=>{send(kind==="debug"?"log":kind,values.map(show).join(" "));own(...values)}}addEventListener("error",(event)=>send("error",String(event.message),event.lineno||null));addEventListener("unhandledrejection",(event)=>send("error",show(event.reason)));let started=0;window.__faridaLoop=()=>{if(!started){started=Date.now();queueMicrotask(()=>{started=0})}else if(Date.now()-started>${LOOP_SECONDS * 1000}){started=0;throw new Error("${LOOP_STOPPED}")}}})()</script>`;

const SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi;

/** A student's page ready to play: its console reported, its loops guarded. */
export function playablePage(html: string): string {
  const scripts = html.replace(
    SCRIPT,
    (whole, attributes: string | undefined, code: string) => {
      const kind = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes ?? "")?.[1];
      const module = kind?.toLowerCase() === "module";
      if (/\bsrc\s*=/i.test(attributes ?? "")) return whole;
      if (kind && !module && !/javascript|ecmascript/i.test(kind)) return whole;
      return `<script${attributes ?? ""}>${guardedScript(code, module)}</script>`;
    },
  );
  const doctype = /^\s*<!doctype[^>]*>/i.exec(scripts)?.[0] ?? "";
  // Before the doctype the page would fall back to quirks mode.
  return doctype + PRELUDE + scripts.slice(doctype.length);
}
