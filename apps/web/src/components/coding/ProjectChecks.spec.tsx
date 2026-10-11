import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectChecks, ProjectNotes } from "./ProjectChecks";

describe("what a finished project does", () => {
  it("says nothing where the question asks for nothing", () => {
    expect(
      renderToStaticMarkup(<ProjectChecks asked={[]} has={["flag"]} />),
    ).toBe("");
  });

  it("waits for a saved project before saying which are done", () => {
    const list = renderToStaticMarkup(
      <ProjectChecks asked={["flag", "loop"]} has={undefined} />,
    );
    expect(list).toContain("Starts with the green flag");
    expect(list).toContain("Each is ticked when a saved project does it.");
    expect(list).not.toContain("Not yet");
  });

  it("counts what the saved project does of what was asked, and no more", () => {
    const list = renderToStaticMarkup(
      <ProjectChecks asked={["flag", "loop"]} has={["loop", "sound"]} />,
    );
    expect(list).toContain("1 of 2 so far");
    expect(list).not.toContain("Plays a sound");
  });
});

describe("what in a project is worth a second look", () => {
  it("is not shown where nothing was noted", () => {
    expect(renderToStaticMarkup(<ProjectNotes notes={[]} />)).toBe("");
    expect(renderToStaticMarkup(<ProjectNotes notes={null} />)).toBe("");
  });

  it("names the message, and passes over a note it does not know", () => {
    const notes = renderToStaticMarkup(
      <ProjectNotes
        notes={[
          { kind: "unheard", message: "start game" },
          { kind: "forever" },
          { kind: "from a later version" },
        ]}
      />,
    );
    expect(notes).toContain("“start game” is sent");
    expect(notes).toContain("inside another loop");
    expect(notes.match(/<li/g)).toHaveLength(2);
  });
});
