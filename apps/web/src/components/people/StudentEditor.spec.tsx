import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModuleFillings } from "~/utils/extension";

import {
  getPeopleOptions,
  getStudentMatches,
  saveStudent,
} from "~/server/students";
import { render } from "~/testUtils";

import { GRADE_LEVELS } from "../grade-levels/contributions";
import { StudentEditor } from "./StudentEditor";

// The grade a new student starts in is the grade levels' part of the form.
vi.mock("~/server/auth", () => ({
  getCurrentUser: vi.fn(() =>
    Promise.resolve({
      nameEn: "Salama Ashoush",
      nameAr: null,
      preferredName: null,
      loginName: null,
      photoFileId: null,
      capabilities: [],
      modules: { grade_levels: true },
      wording: {},
      school: { nameEn: "Acme School", nameAr: null },
    }),
  ),
}));

vi.mock("~/server/grade-levels", () => ({
  getGradeOptions: vi.fn(() =>
    Promise.resolve({
      grades: [
        {
          id: "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a03",
          code: "G1",
          meaning: "grade_1",
          labelEn: "Grade 1",
          labelAr: "الصف الأول",
          retired: false,
        },
      ],
      today: "2026-09-27",
    }),
  ),
  getStudentGrades: vi.fn(),
  setStudentGrade: vi.fn(),
  getGradeSettings: vi.fn(),
  saveGradeLevel: vi.fn(),
  orderGradeLevels: vi.fn(),
  retireGradeLevel: vi.fn(),
}));

vi.mock("~/server/students", () => ({
  getPeopleOptions: vi.fn(),
  getStudentRecord: vi.fn(),
  getStudentHistory: vi.fn(),
  getStudents: vi.fn(),
  getStudentMatches: vi.fn(),
  findByContact: vi.fn(),
  saveStudent: vi.fn(),
  getPersonRecord: vi.fn(),
  getPersonHistory: vi.fn(),
}));

const GRADE = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a03";
const EXISTING = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a04";

function slowly<T>(value: T) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(value), 30));
}

const OPTIONS = {
  sexes: [],
  positions: [],
  religions: [],
  today: "2026-09-27",
};

const MATCH = {
  id: EXISTING,
  fullNameEn: "Salama Ashoush",
  fullNameAr: null,
  birthDate: "2015-03-12",
  atThisSchool: true,
};

function renderEditor(onClose: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    context: { extensions: [GRADE_LEVELS] },
    routeTree: createRootRouteWithContext<{
      extensions: readonly ModuleFillings[];
    }>()({
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

async function englishName() {
  const group = await screen.findByRole("group", { name: "Name in English" });
  return {
    given: within(group).getByRole("textbox", { name: "First name" }),
    family: within(group).getByRole("textbox", { name: "Family name" }),
  };
}

async function enterStudent(reference: string, birthDate?: string) {
  const user = userEvent.setup();
  const name = await englishName();
  await user.type(name.given, "Salama");
  await user.type(name.family, "Ashoush");
  await user.type(
    screen.getByRole("textbox", { name: "Student reference" }),
    reference,
  );
  if (birthDate)
    fireEvent.change(screen.getByLabelText(/^Date of birth/), {
      target: { value: birthDate },
    });
  return { user, name };
}

describe("adding a student", () => {
  beforeEach(() => {
    vi.mocked(getPeopleOptions).mockImplementation(() => slowly(OPTIONS));
    vi.mocked(saveStudent).mockImplementation(() =>
      slowly({ id: "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a01", version: 1 }),
    );
    vi.mocked(getStudentMatches).mockImplementation(() => slowly([]));
  });

  it("offers the existing record for a matching name and date of birth, then adds on a second save", async () => {
    vi.mocked(getStudentMatches).mockImplementation(() => slowly([MATCH]));
    const onClose = vi.fn();
    renderEditor(onClose);
    const { user } = await enterStudent("TEST-0002", "2015-03-12");

    await user.click(screen.getByRole("button", { name: "Save" }));

    const notice = await screen.findByRole("alert", {
      name: "This name and date of birth are already recorded.",
    });
    await waitFor(() => expect(notice).toHaveFocus());
    expect(getStudentMatches).toHaveBeenCalledWith({
      data: {
        names: {
          ar: { given: "", middle: "", family: "" },
          en: { given: "Salama", middle: "", family: "Ashoush" },
        },
        birthDate: "2015-03-12",
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
    vi.mocked(getStudentMatches).mockImplementation(() => slowly([MATCH]));
    renderEditor(vi.fn());
    const { user } = await enterStudent("TEST-0003", "2015-03-12");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    fireEvent.change(screen.getByLabelText(/^Date of birth/), {
      target: { value: "2015-03-13" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("alert");
    expect(getStudentMatches).toHaveBeenCalledTimes(2);
    expect(saveStudent).not.toHaveBeenCalled();
  });

  it("leaves focus in the name field when the matched name is typed back", async () => {
    vi.mocked(getStudentMatches).mockImplementation(() => slowly([MATCH]));
    renderEditor(vi.fn());
    const { user, name } = await enterStudent("TEST-0004", "2015-03-12");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());

    await user.click(name.given);
    await user.keyboard("{End}a{Backspace}");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(name.given).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.keyboard("x");
    expect(name.given).toHaveValue("Salamax");
  });

  it("saves and starts the next student in the same grade from the first name field", async () => {
    const onClose = vi.fn();
    renderEditor(onClose);
    const { user, name } = await enterStudent("TEST-0001");
    await user.click(screen.getByRole("combobox", { name: /^Grade/ }));
    await user.click(await screen.findByRole("option", { name: "Grade 1" }));

    await user.click(
      screen.getByRole("button", { name: "Save and add another" }),
    );

    const arabic = screen.getByRole("group", { name: "Name in Arabic" });
    const first = within(arabic).getByRole("textbox", { name: "First name" });
    await waitFor(() => expect(first).toHaveFocus());
    expect(saveStudent).toHaveBeenCalledOnce();
    expect(vi.mocked(saveStudent).mock.calls[0]?.[0]).toMatchObject({
      data: {
        names: { en: { given: "Salama", family: "Ashoush" } },
        reference: "TEST-0001",
        parts: { grade: { gradeId: GRADE } },
      },
    });
    expect(name.given).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Student reference" }),
    ).toHaveValue("");
    expect(screen.getByRole("combobox", { name: /^Grade/ })).toHaveTextContent(
      "Grade 1",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps an empty name field in the page's direction", async () => {
    renderEditor(vi.fn());
    const name = await englishName();
    expect(name.given).not.toHaveAttribute("dir");
    await userEvent.setup().type(name.given, "Salama");
    expect(name.given).toHaveAttribute("dir", "auto");
    expect(
      screen.getByRole("textbox", { name: "Student reference" }),
    ).toHaveAttribute("dir", "ltr");
  });
});
