import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
// @vitest-environment node
import { loadPyodide } from "pyodide";
import { beforeAll, describe, expect, it } from "vitest";

import type { DrawCommand, Drawing } from "./runner";

const pyodideDir = dirname(
  createRequire(import.meta.url).resolve("pyodide/package.json"),
);
let python: Awaited<ReturnType<typeof loadPyodide>>;

beforeAll(async () => {
  python = await loadPyodide({ indexURL: `${pyodideDir}/` });
  python.FS.writeFile(
    "/home/pyodide/turtle.py",
    readFileSync(new URL("turtle.py", import.meta.url), "utf8"),
  );
}, 60_000);

function draw(code: string): Drawing {
  python.runPython("import sys\nsys.modules.pop('turtle', None)");
  python.runPython(code, { globals: python.globals.get("dict")() });
  return JSON.parse(
    python.runPython(
      "import json, sys\njson.dumps(sys.modules['turtle']._drawing())",
    ) as string,
  ) as Drawing;
}

// Rounding a tiny negative gives -0, which is not the 0 a reader means.
const whole = (value: number) => Math.round(value) || 0;
const round = ([x, y]: [number, number]) => [whole(x), whole(y)];

describe("turtle drawings", () => {
  it("records each line where Python's turtle would draw it", () => {
    const { commands } = draw(
      "import turtle\nfor _ in range(4):\n    turtle.forward(100)\n    turtle.left(90)",
    );
    const lines = commands.flatMap((command) =>
      command.op === "line" ? [[round(command.from), round(command.to)]] : [],
    );
    expect(lines).toEqual([
      [
        [0, 0],
        [100, 0],
      ],
      [
        [100, 0],
        [100, 100],
      ],
      [
        [100, 100],
        [0, 100],
      ],
      [
        [0, 100],
        [0, 0],
      ],
    ]);
  });

  it("draws a circle round a centre to the turtle's left and comes back", () => {
    const { commands } = draw("from turtle import *\ncircle(50)");
    const lines = commands.filter((command) => command.op === "line");
    const last = lines.at(-1);
    if (!last) throw new Error("no line");
    expect(round(last.to)).toEqual([0, 0]);
    const top = Math.max(...lines.map((line) => line.to[1]));
    expect(Math.round(top)).toBe(100);
  });

  it("fills beneath what follows, in colours given any of the usual ways", () => {
    const { commands, screen } = draw(
      "import turtle\nturtle.colormode(255)\nturtle.bgcolor('navy')\nt = turtle.Turtle()\nt.fillcolor(255, 128, 0)\nt.begin_fill()\nt.goto(50, 0)\nt.goto(0, 50)\nt.end_fill()",
    );
    const fill = commands.find(
      (command): command is Extract<DrawCommand, { op: "fill" }> =>
        command.op === "fill",
    );
    expect(fill).toMatchObject({ color: "#ff8000" });
    expect(fill?.points.map(round)).toEqual([
      [0, 0],
      [50, 0],
      [0, 50],
    ]);
    const lines = commands.findIndex((command) => command.op === "line");
    expect(fill && commands.indexOf(fill)).toBeLessThan(lines);
    expect(screen.bg).toBe("navy");
  });
});
