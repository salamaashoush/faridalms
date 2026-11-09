import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";
import { EmptyState, FilteredEmptyState } from "./empty-state";
import { RecordEmpty, RecordSection } from "./record-page";
import { renderWithSystem } from "./testing";
import { Value } from "./value";

describe("empty states", () => {
  it("leads with what to do and its one action", () => {
    renderWithSystem(
      <EmptyState
        title="Add your first school"
        description="Schools appear here once created."
        action={<button type="button">New school</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Add your first school" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New school" }),
    ).toBeInTheDocument();
  });

  it("offers to clear filters that matched nothing", async () => {
    const onClear = vi.fn<() => void>();
    renderWithSystem(<FilteredEmptyState onClear={onClear} />);
    expect(
      screen.getByRole("heading", {
        name: "Nothing matches your search or filters",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("says it in one line inside a section, under the section's heading", () => {
    renderWithSystem(
      <RecordSection title="By grade and intake">
        <EmptyState
          icon={Inbox}
          title="No applications sent for this year yet"
          description="Each one counts once it is sent."
          action={<button type="button">Open applications</button>}
        />
      </RecordSection>,
    );
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(
      screen.getByText("No applications sent for this year yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Each one counts once it is sent."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open applications" }),
    ).toBeInTheDocument();
  });

  it("draws a table's empty state as its section's line", () => {
    renderWithSystem(
      <RecordSection title="Time in each state">
        <DataTable
          caption="Time in each state"
          rows={[]}
          columns={[
            { id: "state", header: "State", primary: true, cell: () => "" },
          ]}
          rowLabel={() => ""}
          card={{ title: () => "" }}
          empty={{ icon: Inbox, title: "No applications sent yet" }}
        />
      </RecordSection>,
    );
    expect(
      screen.queryByRole("heading", { name: "No applications sent yet" }),
    ).toBeNull();
    expect(screen.getByText("No applications sent yet")).toBeInTheDocument();
  });

  it("keeps a section's filtered state with its way back", async () => {
    const onClear = vi.fn<() => void>();
    renderWithSystem(
      <RecordSection title="Words">
        <FilteredEmptyState title="No word matches." onClear={onClear} />
      </RecordSection>,
    );
    expect(screen.getByText("No word matches.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("marks nothing left to do and nothing to see by their own icon", () => {
    const { container } = renderWithSystem(
      <>
        <EmptyState kind="done" title="Nothing needs you today" />
        <EmptyState
          kind="restricted"
          placement="section"
          title="The school has not shared this"
        />
      </>,
    );
    expect(container.querySelector(".lucide-circle-check")).not.toBeNull();
    expect(container.querySelector(".lucide-lock-keyhole")).not.toBeNull();
  });

  it("lets a record say a section is empty in its words", () => {
    renderWithSystem(
      <RecordSection title="Guardians">
        <RecordEmpty>No guardian linked</RecordEmpty>
      </RecordSection>,
    );
    expect(screen.getByText("No guardian linked")).toBeInTheDocument();
  });

  it("says what a missing value means when there is simply none", () => {
    renderWithSystem(
      <ul>
        <li>
          <Value absent="No guardian" />
        </li>
        <li>
          <Value absent="No guardian">Salama Ashoush</Value>
        </li>
        <li>
          <Value>{null}</Value>
        </li>
      </ul>,
    );
    expect(screen.getByText("No guardian")).toBeInTheDocument();
    expect(screen.getByText("Salama Ashoush")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
  });
});
