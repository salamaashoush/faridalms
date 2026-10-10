import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "~/testUtils";

import type { RunEnd, RunStream } from "./runner/runner";

import { markErrorLine } from "./code-editor";
import { CodeRunner } from "./CodeRunner";
import { runCode } from "./runner/runner";

// The runner starts Python in a frame and the editor is CodeMirror; here a
// run is whatever the test says it was, and the editor a stand-in.
vi.mock("./runner/runner", () => ({ RUN_SECONDS: 10, runCode: vi.fn() }));
vi.mock("./code-editor", () => ({
  createCodeEditor: vi.fn(() => ({ destroy: vi.fn() })),
  markErrorLine: vi.fn(),
  setReadOnly: vi.fn(),
  replaceCode: vi.fn(),
}));

interface Handlers {
  onStarted: () => void;
  onOutput: (stream: RunStream, text: string) => void;
}

/** Has the next run wait to be told how it went. */
function nextRun() {
  const run: { handlers?: Handlers; end?: (end: RunEnd) => void } = {};
  vi.mocked(runCode).mockImplementation((_request, handlers) => {
    run.handlers = handlers;
    return {
      done: new Promise<RunEnd>((resolve) => {
        run.end = resolve;
      }),
      stop: vi.fn(),
    };
  });
  return run;
}

beforeEach(() => vi.clearAllMocks());

describe("CodeRunner", () => {
  it("runs the code as it stands, shows what it prints and reports the run", async () => {
    const user = userEvent.setup();
    const run = nextRun();
    const onRan = vi.fn();
    render(<CodeRunner source="print(1)" language="python" onRan={onRan} />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(runCode).toHaveBeenCalledWith(
      { language: "python", code: "print(1)", stdin: [], modules: {} },
      expect.anything(),
    );
    // While it runs, the way to run it gives way to the way to stop it.
    expect(screen.getByRole("button", { name: "Stop" })).toBeVisible();
    run.handlers?.onStarted();
    run.handlers?.onOutput("out", "1\n");
    const end: RunEnd = { status: "done", error: null };
    run.end?.(end);
    expect(await screen.findByText("1")).toBeVisible();
    await waitFor(() =>
      expect(onRan).toHaveBeenCalledWith({
        code: "print(1)",
        input: "",
        end,
        printed: "1\n",
      }),
    );
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });

  it("says where a run failed and marks the line in the code", async () => {
    const user = userEvent.setup();
    const run = nextRun();
    render(<CodeRunner source={"a = 1\nprint(b)"} language="python" />);
    // The editor loads apart from the page; its line can be marked once it has.
    await waitFor(() =>
      expect(screen.queryByText("print(b)")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Run" }));
    run.end?.({
      status: "done",
      error: {
        name: "NameError",
        message: "NameError: name 'b' is not defined",
        line: 2,
        trace: "",
      },
    });
    expect(
      (await screen.findAllByText("Line 2: NameError: name 'b' is not defined"))
        .length,
    ).toBeGreaterThan(0);
    expect(markErrorLine).toHaveBeenLastCalledWith(expect.anything(), 2);
  });

  it("runs nothing while it waits for a prediction", () => {
    render(<CodeRunner source="print(1)" language="python" locked />);
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });
});
