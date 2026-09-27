import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveStaff } from "~/server/staff";
import { findGuardians, getPeopleOptions } from "~/server/students";

import { StaffEditor } from "./StaffEditor";

vi.mock("~/server/students", () => ({
  getPeopleOptions: vi.fn(),
  getStudentRecord: vi.fn(),
  getStudentHistory: vi.fn(),
  getStudents: vi.fn(),
  getStudentMatches: vi.fn(),
  findGuardians: vi.fn(),
  saveStudent: vi.fn(),
  saveRelationship: vi.fn(),
  endRelationship: vi.fn(),
  getPersonRecord: vi.fn(),
  getPersonHistory: vi.fn(),
  saveSignIn: vi.fn(),
  setSignInState: vi.fn(),
}));
vi.mock("~/server/staff", () => ({
  getStaff: vi.fn(),
  getStaffMember: vi.fn(),
  saveStaff: vi.fn(),
}));

const EXISTING = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a04";
const SAVED = { id: "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a01", version: 1 };

function renderEditor(onClose: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={null}>
            <StaffEditor onClose={onClose} />
          </Suspense>
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

async function enterStaff() {
  const user = userEvent.setup();
  const group = await screen.findByRole("group", { name: "Name in English" });
  await user.type(
    within(group).getByRole("textbox", { name: "First name" }),
    "Salama",
  );
  await user.type(
    within(group).getByRole("textbox", { name: "Family name" }),
    "Ashoush",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Email" }),
    "salama@example.com",
  );
  return user;
}

describe("adding a staff member", () => {
  beforeEach(() => {
    vi.mocked(getPeopleOptions).mockResolvedValue({
      grades: [],
      relations: [],
      sexes: [],
      positions: [],
      years: [],
      workingYearId: null,
    });
    vi.mocked(findGuardians).mockResolvedValue([]);
    vi.mocked(saveStaff).mockResolvedValue(SAVED);
  });

  it("asks for at least one role before saving", async () => {
    renderEditor(vi.fn());
    const user = await enterStaff();
    await user.click(screen.getByRole("checkbox", { name: "Teacher" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Choose at least one role")).toBeVisible();
    expect(saveStaff).not.toHaveBeenCalled();
  });

  it("offers the person who already holds the email and adds them instead of a new record", async () => {
    vi.mocked(findGuardians).mockImplementation((options) =>
      Promise.resolve(
        options.data.email
          ? [
              {
                id: EXISTING,
                fullNameEn: "Salama Hassan",
                fullNameAr: null,
                birthYear: 1985,
                photoFileId: null,
              },
            ]
          : [],
      ),
    );
    const onClose = vi.fn();
    renderEditor(onClose);
    const user = await enterStaff();
    await user.click(screen.getByRole("button", { name: "Save" }));

    const notice = await screen.findByRole("alert", {
      name: "This email or phone already belongs to someone recorded.",
    });
    await waitFor(() => expect(notice).toHaveFocus());
    expect(saveStaff).not.toHaveBeenCalled();

    await user.click(
      within(notice).getByRole("button", {
        name: "Add Salama Hassan to the staff",
      }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(vi.mocked(saveStaff).mock.calls[0]?.[0]).toMatchObject({
      data: {
        existingUserId: EXISTING,
        email: "salama@example.com",
        roles: ["teacher"],
      },
    });
  });

  it("adds a new person when saved again past the match", async () => {
    vi.mocked(findGuardians).mockResolvedValue([
      {
        id: EXISTING,
        fullNameEn: "Salama Hassan",
        fullNameAr: null,
        birthYear: null,
        photoFileId: null,
      },
    ]);
    const onClose = vi.fn();
    renderEditor(onClose);
    const user = await enterStaff();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(vi.mocked(saveStaff).mock.calls[0]?.[0].data).not.toHaveProperty(
      "existingUserId",
    );
  });
});
