import type { ManagementOptionsInput } from "@faridalms/domain/administration-schema";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getManagementOptions,
  getStudentMatches,
  saveStudent,
} from "~/server/school";

import { StudentEditor } from "./StudentEditor";

vi.mock("~/server/school", () => ({
  getManagementOptions: vi.fn(),
  getStudentForManagement: vi.fn(),
  getStudent: vi.fn(),
  getStudentMatches: vi.fn(),
  saveStudent: vi.fn(),
}));

const CLASS = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a03";
const EXISTING = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a04";

function slowly<T>(value: T) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(value), 30));
}

function renderEditor(onClose: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={null}>
            <StudentEditor onClose={onClose} />
          </Suspense>
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("adding a student", () => {
  beforeEach(() => {
    vi.mocked(getManagementOptions).mockImplementation((options) => {
      const input = options?.data as ManagementOptionsInput | undefined;
      return slowly(
        input?.kind === "classes" ? [{ id: CLASS, name: "P1-B" }] : [],
      );
    });
    vi.mocked(saveStudent).mockImplementation(() =>
      slowly({ id: "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a01" }),
    );
    vi.mocked(getStudentMatches).mockImplementation(() => slowly([]));
  });

  it("offers the existing record for a matching name and date of birth, then adds on a second save", async () => {
    vi.mocked(getStudentMatches).mockImplementation(() =>
      slowly([
        {
          id: EXISTING,
          reference: "GIC-2015-0007",
          firstName: "Salama",
          lastName: "Ashoush",
          birthdate: "2015-03-12",
        },
      ]),
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor(onClose);
    await user.type(
      await screen.findByRole("textbox", { name: "First name" }),
      "salama",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Last name" }),
      "Ashoush",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Student reference" }),
      "TEST-0002",
    );
    fireEvent.change(screen.getByLabelText("Date of birth"), {
      target: { value: "2015-03-12" },
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    const notice = await screen.findByRole("alert", {
      name: "This name and date of birth are already recorded.",
    });
    await waitFor(() => expect(notice).toHaveFocus());
    expect(getStudentMatches).toHaveBeenCalledWith({
      data: {
        firstName: "salama",
        lastName: "Ashoush",
        birthdate: "2015-03-12",
      },
    });
    expect(screen.getByRole("link", { name: "Open existing" })).toHaveAttribute(
      "href",
      `/students/${EXISTING}`,
    );
    expect(saveStudent).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(saveStudent).toHaveBeenCalledOnce();
    expect(getStudentMatches).toHaveBeenCalledOnce();
  });

  it("checks again once the name or date of birth changes", async () => {
    vi.mocked(getStudentMatches).mockImplementation(() =>
      slowly([
        {
          id: EXISTING,
          reference: "GIC-2015-0007",
          firstName: "Salama",
          lastName: "Ashoush",
          birthdate: "2015-03-12",
        },
      ]),
    );
    const user = userEvent.setup();
    renderEditor(vi.fn());
    await user.type(
      await screen.findByRole("textbox", { name: "First name" }),
      "Salama",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Last name" }),
      "Ashoush",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Student reference" }),
      "TEST-0003",
    );
    const birthdate = screen.getByLabelText("Date of birth");
    fireEvent.change(birthdate, { target: { value: "2015-03-12" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    fireEvent.change(birthdate, { target: { value: "2015-03-13" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("alert");
    expect(getStudentMatches).toHaveBeenCalledTimes(2);
    expect(saveStudent).not.toHaveBeenCalled();
  });

  it("leaves focus in the name field when the matched name is typed back", async () => {
    vi.mocked(getStudentMatches).mockImplementation(() =>
      slowly([
        {
          id: EXISTING,
          reference: "GIC-2015-0007",
          firstName: "Salama",
          lastName: "Ashoush",
          birthdate: "2015-03-12",
        },
      ]),
    );
    const user = userEvent.setup();
    renderEditor(vi.fn());
    const firstName = await screen.findByRole("textbox", {
      name: "First name",
    });
    await user.type(firstName, "Salama");
    await user.type(
      screen.getByRole("textbox", { name: "Last name" }),
      "Ashoush",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Student reference" }),
      "TEST-0004",
    );
    fireEvent.change(screen.getByLabelText("Date of birth"), {
      target: { value: "2015-03-12" },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());

    await user.click(firstName);
    await user.keyboard("{End}a{Backspace}");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(firstName).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.keyboard("x");
    expect(firstName).toHaveValue("Salamax");
  });

  it("saves and starts the next student in the same class from First name", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor(onClose);
    await user.type(
      await screen.findByRole("textbox", { name: "First name" }),
      "Salama",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Last name" }),
      "Ashoush",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Student reference" }),
      "TEST-0001",
    );
    await user.click(await screen.findByRole("combobox", { name: /^Class/ }));
    await user.click(await screen.findByRole("option", { name: "P1-B" }));

    await user.click(
      screen.getByRole("button", { name: "Save and add another" }),
    );

    const firstName = screen.getByRole("textbox", { name: "First name" });
    await waitFor(() => expect(firstName).toHaveFocus());
    expect(saveStudent).toHaveBeenCalledOnce();
    expect(vi.mocked(saveStudent).mock.calls[0]?.[0]).toMatchObject({
      data: {
        firstName: "Salama",
        lastName: "Ashoush",
        reference: "TEST-0001",
        classId: CLASS,
      },
    });
    expect(firstName).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Student reference" }),
    ).toHaveValue("");
    expect(screen.getByRole("combobox", { name: /^Class/ })).toHaveTextContent(
      "P1-B",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps an empty name field in the page's direction", async () => {
    renderEditor(vi.fn());
    const firstName = await screen.findByRole("textbox", {
      name: "First name",
    });
    expect(firstName).not.toHaveAttribute("dir");
    await userEvent.setup().type(firstName, "Salama");
    expect(firstName).toHaveAttribute("dir", "auto");
    expect(
      screen.getByRole("textbox", { name: "Student reference" }),
    ).toHaveAttribute("dir", "ltr");
  });
});
