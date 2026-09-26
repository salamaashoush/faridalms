import type { ManagementOptionsInput } from "@faridalms/domain/administration-schema";
import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { studentQuery } from "~/queries/school";
import {
  getManagementOptions,
  getStudentForManagement,
  saveStudent,
} from "~/server/school";

import { prepareStudentSheet, StudentEditSheet } from "./StudentForms";

vi.mock("~/server/school", () => ({
  getManagementOptions: vi.fn(),
  getStudentForManagement: vi.fn(),
  getStudent: vi.fn(),
  saveStudent: vi.fn(),
}));

const STUDENT = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a01";
const GUARDIAN = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a02";
const SECOND_GUARDIAN = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a05";
const CLASS = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a03";

function slowly<T>(value: T) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(value), 30));
}

function wrapper(queryClient: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>{children}</Suspense>
      </QueryClientProvider>
    );
  };
}

describe("student section sheets", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // The record page's loader has already read the record itself.
    queryClient.setQueryData(studentQuery({ studentId: STUDENT }).queryKey, {
      today: "2026-09-26",
      profile: {
        id: STUDENT,
        fullName: "Salama Ashoush",
        classId: CLASS,
        className: "P1-B",
        enrollmentHistory: [
          {
            id: "enrolment",
            classId: CLASS,
            className: "P1-B",
            since: "2026-09-01",
            until: null,
            schoolYear: "2026/2027",
            canOpenClass: true,
          },
        ],
      },
    } as never);
    vi.mocked(getStudentForManagement).mockImplementation(() =>
      slowly({
        account: null,
        guardians: [{ id: GUARDIAN, name: "Salama Ashoush" }],
        id: STUDENT,
        reference: "TEST-0001",
        firstName: "Salama",
        lastName: "Ashoush",
        birthdate: "",
        classId: CLASS,
        guardianIds: [GUARDIAN],
        userId: "",
      }),
    );
    vi.mocked(getManagementOptions).mockImplementation((options) => {
      const input = options?.data as ManagementOptionsInput | undefined;
      return slowly(
        input?.kind === "parents"
          ? [{ id: GUARDIAN, name: "Salama Ashoush" }]
          : [{ id: "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a04", name: "PreKG-A" }],
      );
    });
  });

  // A picker still loading when the sheet opens is not there to take focus,
  // which left it on Save, where Enter saves the record unchanged.
  it.each([
    ["guardians", "Edit guardians", /^Guardians/],
    ["class", "Move class", /^New class/],
  ] as const)(
    "puts focus on the %s picker when the sheet opens",
    async (form, title, field) => {
      await prepareStudentSheet(queryClient, STUDENT, form);
      render(
        <StudentEditSheet
          studentId={STUDENT}
          form={form}
          open
          onClose={vi.fn()}
        />,
        { wrapper: wrapper(queryClient) },
      );
      const sheet = await screen.findByRole("dialog", { name: title });
      const picker = await screen.findByRole("combobox", { name: field });
      await waitFor(() => expect(picker).toHaveFocus());
      expect(sheet).toContainElement(picker);
    },
  );

  it("confirms and names a guardian the save removes, even when one stays", async () => {
    vi.mocked(getStudentForManagement).mockImplementation(() =>
      slowly({
        account: null,
        guardians: [
          { id: GUARDIAN, name: "Salama Ashoush" },
          { id: SECOND_GUARDIAN, name: "Salama Hassan" },
        ],
        id: STUDENT,
        reference: "TEST-0001",
        firstName: "Salama",
        lastName: "Ashoush",
        birthdate: "",
        classId: CLASS,
        guardianIds: [GUARDIAN, SECOND_GUARDIAN],
        userId: "",
      }),
    );
    vi.mocked(getManagementOptions).mockImplementation(() =>
      slowly([
        { id: GUARDIAN, name: "Salama Ashoush" },
        { id: SECOND_GUARDIAN, name: "Salama Hassan" },
      ]),
    );
    const user = userEvent.setup();
    await prepareStudentSheet(queryClient, STUDENT, "guardians");
    render(
      <StudentEditSheet
        studentId={STUDENT}
        form="guardians"
        open
        onClose={vi.fn()}
      />,
      { wrapper: wrapper(queryClient) },
    );
    await user.click(
      await screen.findByRole("combobox", { name: /^Guardians/ }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Salama Hassan" }),
    );
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const confirm = await screen.findByRole("dialog", {
      name: "Remove Salama Hassan as a guardian of Salama Ashoush?",
    });
    expect(
      within(confirm).getByRole("button", { name: "Remove guardian" }),
    ).toBeInTheDocument();
    expect(saveStudent).not.toHaveBeenCalled();
  });
});
