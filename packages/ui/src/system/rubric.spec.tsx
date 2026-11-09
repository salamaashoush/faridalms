import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { RubricCriterion, RubricLevelDraft } from "./rubric";

import {
  RubricLevelEditor,
  rubricLevelFieldId,
  RubricLevelPicker,
  RubricMatrix,
} from "./rubric";
import { renderWithSystem } from "./testing";

const EVIDENCE: RubricCriterion = {
  id: "evidence",
  title: "Use of evidence",
  levels: [
    {
      id: "exceeds",
      title: "Exceeds",
      points: 4,
      description: "Weighs two sources against each other.",
    },
    {
      id: "meets",
      title: "Meets",
      points: 3,
      description: "Backs the point with one fitting example.",
    },
    { id: "beginning", title: "Beginning", points: 1 },
  ],
};

const SPELLING: RubricCriterion = {
  id: "spelling",
  title: "Spelling",
  levels: [
    { id: "few", title: "Few slips", points: 2 },
    { id: "many", title: "Many slips", points: 0 },
  ],
};

describe("RubricMatrix", () => {
  it("lists each criterion with the most it earns and every level's points and meaning", () => {
    renderWithSystem(
      <RubricMatrix label="Rubric" criteria={[EVIDENCE, SPELLING]} showTotal />,
    );
    const rubric = screen.getByRole("list", { name: "Rubric" });
    expect(within(rubric).getByText("Up to 4 points")).toBeVisible();
    const levels = screen.getByRole("list", { name: "Levels of Use of evidence" });
    const items = within(levels).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Exceeds4 pointsWeighs two sources against each other.",
      "Meets3 pointsBacks the point with one fitting example.",
      "Beginning1 point",
    ]);
    expect(screen.getByText("Total").parentElement).toHaveTextContent(
      "Total6 points",
    );
  });

  it("marks the awarded level in words and says what each criterion earned", () => {
    renderWithSystem(
      <RubricMatrix
        label="Rubric"
        criteria={[EVIDENCE, SPELLING]}
        awarded={{ evidence: "meets" }}
        renderCriterionNote={(criterion) =>
          criterion.id === "evidence" ? <p>Name the source.</p> : null
        }
      />,
    );
    const levels = screen.getByRole("list", { name: "Levels of Use of evidence" });
    const awarded = within(levels)
      .getAllByRole("listitem")
      .filter((item) => item.textContent?.includes("Awarded"));
    expect(awarded).toHaveLength(1);
    expect(awarded[0]).toHaveTextContent("Meets");
    expect(screen.getByText("3 of 4 points")).toBeVisible();
    expect(screen.getByText("Not marked")).toBeVisible();
    expect(screen.getByText("Name the source.")).toBeVisible();
  });

  it("draws the criterion being written in place of its levels, with Done and a named Cancel", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onCancel = vi.fn();
    renderWithSystem(
      <RubricMatrix
        label="Rubric"
        criteria={[EVIDENCE, SPELLING]}
        renderCriterionActions={(criterion) => (
          <button type="button">Edit {criterion.title}</button>
        )}
        editing={{
          criterionId: "evidence",
          content: <p>Writing evidence</p>,
          onDone,
          onCancel,
        }}
      />,
    );
    expect(screen.getByText("Writing evidence")).toBeVisible();
    expect(
      screen.queryByRole("list", { name: "Levels of Use of evidence" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Use of evidence" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Spelling" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(
      screen.getByRole("button", { name: "Cancel changes to Use of evidence" }),
    );
    expect(onDone).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

function Picker() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <RubricLevelPicker
      id="pick"
      criterion={EVIDENCE}
      value={value}
      onChange={setValue}
    />
  );
}

describe("RubricLevelPicker", () => {
  it("chooses a level by its name, reads its meaning, and clears it", async () => {
    const user = userEvent.setup();
    renderWithSystem(<Picker />);
    const group = screen.getByRole("radiogroup", { name: "Use of evidence" });
    expect(screen.getByText("Not marked")).toBeVisible();
    const meets = within(group).getByRole("radio", { name: "Meets 3 points" });
    expect(meets).toHaveAccessibleDescription(
      "Backs the point with one fitting example.",
    );
    await user.click(meets);
    expect(meets).toBeChecked();
    expect(screen.getByText("3 of 4 points")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Clear the level for Use of evidence" }),
    );
    expect(meets).not.toBeChecked();
    expect(screen.getByText("Not marked")).toBeVisible();
  });

  it("leaves points out where levels carry none to the chooser", () => {
    renderWithSystem(
      <RubricLevelPicker
        id="peer"
        criterion={EVIDENCE}
        value="meets"
        showPoints={false}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("3 points")).toBeNull();
    expect(
      screen.getByRole("radio", { name: "Meets" }),
    ).toBeChecked();
  });
});

let added = 0;
const blank = (): RubricLevelDraft => ({
  id: `added-${(added += 1)}`,
  title: "",
  points: 0,
  description: "",
});

function Levels() {
  const [levels, setLevels] = useState<RubricLevelDraft[]>([
    { id: "a", title: "Exceeds", points: 4, description: "" },
    { id: "b", title: "Meets", points: 3, description: "" },
  ]);
  return (
    <>
      <RubricLevelEditor
        idPrefix="level"
        levels={levels}
        onChange={setLevels}
        newLevel={blank}
        max={3}
        maxDescription={500}
        errors={{ b: { points: "Give the level 0 to 10,000 points." } }}
      />
      <output>
        {levels.map((level) => `${level.title}:${level.points}`).join(",")}
      </output>
    </>
  );
}

describe("RubricLevelEditor", () => {
  it("names every field for its level and reads points typed in Arabic-Indic digits", async () => {
    const user = userEvent.setup();
    renderWithSystem(<Levels />);
    const points = screen.getByRole("textbox", { name: "Points for Exceeds" });
    await user.clear(points);
    await user.type(points, "٥٫٥");
    expect(screen.getByRole("status")).toHaveTextContent("Exceeds:5.5,Meets:3");
    expect(
      screen.getByRole("textbox", { name: "What work at Meets looks like" }),
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Points for Meets" }),
    ).toHaveAccessibleDescription("Give the level 0 to 10,000 points.");
  });

  it("moves, adds and removes levels from each level's menu", async () => {
    const user = userEvent.setup();
    renderWithSystem(<Levels />);
    await user.click(screen.getByRole("button", { name: "Actions for Meets" }));
    await user.click(screen.getByRole("menuitem", { name: "Move up" }));
    expect(screen.getByRole("status")).toHaveTextContent("Meets:3,Exceeds:4");
    expect(screen.getByText("Meets is now level 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add a level" }));
    const name = screen.getByRole("textbox", { name: "Name of level 3" });
    expect(name).toHaveFocus();
    expect(name.id).toBe(rubricLevelFieldId("level", `added-${added}`, "title"));
    expect(screen.getByRole("button", { name: "Add a level" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Actions for Exceeds" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove level" }));
    expect(screen.getByRole("status")).toHaveTextContent("Meets:3,:0");
  });
});
