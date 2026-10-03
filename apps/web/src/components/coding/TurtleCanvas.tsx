import { Button } from "@faridalms/ui/button";
import { FastForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type { DrawCommand, Drawing } from "./runner/runner";

/** The longest a drawing takes to play back, however many steps it has. */
const PLAY_MS = 4000;

interface Pen {
  x: number;
  y: number;
  heading: number;
  visible: boolean;
}

function arrow(context: CanvasRenderingContext2D, pen: Pen, color: string) {
  context.save();
  context.translate(pen.x, pen.y);
  context.rotate((pen.heading * Math.PI) / 180);
  context.beginPath();
  context.moveTo(9, 0);
  context.lineTo(-5, 5);
  context.lineTo(-2, 0);
  context.lineTo(-5, -5);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.restore();
}

/** Draws one step of the drawing on a canvas whose y grows upwards. */
function step(
  context: CanvasRenderingContext2D,
  command: DrawCommand,
  pens: Map<number, Pen>,
) {
  switch (command.op) {
    case "turtle":
      pens.set(command.id, {
        x: command.x,
        y: command.y,
        heading: command.heading,
        visible: command.visible,
      });
      return;
    case "line": {
      context.beginPath();
      context.moveTo(...command.from);
      context.lineTo(...command.to);
      context.strokeStyle = command.color;
      context.lineWidth = command.width;
      context.stroke();
      const pen = pens.get(command.id);
      if (pen) [pen.x, pen.y] = command.to;
      return;
    }
    case "move": {
      const pen = pens.get(command.id);
      if (pen) [pen.x, pen.y] = command.to;
      return;
    }
    case "turn": {
      const pen = pens.get(command.id);
      if (pen) pen.heading = command.heading;
      return;
    }
    case "dot":
      context.beginPath();
      context.arc(...command.at, command.size / 2, 0, Math.PI * 2);
      context.fillStyle = command.color;
      context.fill();
      return;
    case "stamp":
      arrow(
        context,
        {
          x: command.at[0],
          y: command.at[1],
          heading: command.heading,
          visible: true,
        },
        command.color,
      );
      return;
    case "fill": {
      const [first, ...rest] = command.points;
      if (!first) return;
      context.beginPath();
      context.moveTo(...first);
      for (const point of rest) context.lineTo(...point);
      context.closePath();
      context.fillStyle = command.color;
      context.fill();
      return;
    }
    case "text": {
      const [family = "Arial", size = 8, style = "normal"] = command.font;
      context.save();
      context.scale(1, -1);
      context.font = `${style} ${Number(size) * 1.4}px ${String(family)}, sans-serif`;
      context.textAlign =
        command.align === "center" || command.align === "right"
          ? command.align
          : "left";
      context.fillStyle = command.color;
      context.fillText(command.text, command.at[0], -command.at[1]);
      context.restore();
      return;
    }
    default:
      return;
  }
}

/**
 * What a student's turtle drew, played back step by step at the speed the
 * program asked for, within a few seconds however long it is.
 */
export function TurtleCanvas({ drawing }: { drawing: Drawing }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  const [finish, setFinish] = useState(false);
  const { width, height } = drawing.screen;
  const [background, setBackground] = useState(drawing.screen.bg);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return undefined;
    const ratio = window.devicePixelRatio || 1;
    element.width = width * ratio;
    element.height = height * ratio;
    const pens = new Map<number, Pen>();
    const ink = document.createElement("canvas");
    ink.width = element.width;
    ink.height = element.height;
    const paper = ink.getContext("2d");
    if (!paper) return undefined;
    paper.setTransform(
      ratio,
      0,
      0,
      -ratio,
      (width * ratio) / 2,
      (height * ratio) / 2,
    );
    paper.lineCap = "round";
    paper.lineJoin = "round";
    const { commands } = drawing;
    const instant =
      finish || commands.some((command) => command.op === "instant");
    // Slow turtles take longer over each step, as in Python's own; a long
    // drawing is sped up to fit.
    const durations = commands.map((command) => {
      if (instant || !("speed" in command) || command.speed === 0) return 0;
      if (command.op === "line" || command.op === "move")
        return (11 - command.speed) * 30;
      return command.op === "turn" ? (11 - command.speed) * 12 : 0;
    });
    const total = durations.reduce((sum, ms) => sum + ms, 0);
    const scale = total > PLAY_MS ? PLAY_MS / total : 1;
    const began = performance.now();
    let at = 0;
    let reached = 0;
    let frame = 0;
    const apply = (command: DrawCommand) => {
      if (command.op === "bg") setBackground(command.color);
      else if (command.op === "clear") {
        paper.save();
        paper.setTransform(1, 0, 0, 1, 0, 0);
        paper.clearRect(0, 0, ink.width, ink.height);
        paper.restore();
      } else step(paper, command, pens);
    };
    const play = (now: number) => {
      const elapsed = now - began;
      for (; at < commands.length; at++) {
        const ms = (durations[at] ?? 0) * scale;
        if (reached + ms > elapsed) break;
        reached += ms;
        const command = commands[at];
        if (command) apply(command);
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, element.width, element.height);
      context.drawImage(ink, 0, 0);
      context.setTransform(
        ratio,
        0,
        0,
        -ratio,
        (width * ratio) / 2,
        (height * ratio) / 2,
      );
      context.lineCap = "round";
      // The step under way is drawn as far as it has got.
      const going = commands[at];
      const share = Math.min(
        1,
        (elapsed - reached) / Math.max(1, (durations[at] ?? 0) * scale),
      );
      const moving =
        going && (going.op === "line" || going.op === "move") ? going : null;
      if (moving?.op === "line") {
        const [x0, y0] = moving.from;
        const [x1, y1] = moving.to;
        context.beginPath();
        context.moveTo(x0, y0);
        context.lineTo(x0 + (x1 - x0) * share, y0 + (y1 - y0) * share);
        context.strokeStyle = moving.color;
        context.lineWidth = moving.width;
        context.stroke();
      }
      for (const [id, pen] of pens) {
        if (!pen.visible) continue;
        if (moving && moving.id === id) {
          const [x1, y1] = moving.to;
          arrow(
            context,
            {
              ...pen,
              x: pen.x + (x1 - pen.x) * share,
              y: pen.y + (y1 - pen.y) * share,
            },
            "#1f2937",
          );
        } else arrow(context, pen, "#1f2937");
      }
      if (at < commands.length) frame = requestAnimationFrame(play);
      else setDone(true);
    };
    frame = requestAnimationFrame(play);
    return () => cancelAnimationFrame(frame);
  }, [drawing, width, height, finish]);

  const lines = drawing.commands.filter(
    (command) => command.op === "line",
  ).length;
  return (
    <div className="grid gap-2 border-t px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p
          dir="auto"
          className="text-[13px] leading-[18px] font-medium text-muted-foreground"
        >
          {drawing.screen.title || m.codeDrawing()}
        </p>
        {done ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-md:h-10"
            onClick={() => setFinish(true)}
          >
            <FastForward aria-hidden />
            {m.codeDrawingFinish()}
          </Button>
        )}
      </div>
      <p className="sr-only">
        {m.codeDrawingLabel({ lines: formatNumber(lines) })}
      </p>
      <canvas
        ref={canvas}
        aria-hidden
        style={{ aspectRatio: `${width} / ${height}`, background }}
        className="w-full max-w-[min(100%,400px)] justify-self-center rounded-md border"
      />
    </div>
  );
}
