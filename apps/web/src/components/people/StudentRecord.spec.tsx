import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  endRelationship,
  getPeopleOptions,
  getStudentRecord,
} from "~/server/students";
import { render } from "~/testUtils";

import type { StudentData } from "./StudentRecord";

import { StudentRecord } from "./StudentRecord";

vi.mock("~/server/students", () => ({
  getPeopleOptions: vi.fn(),
  getStudentRecord: vi.fn(),
  getStudentHistory: vi.fn(),
  getStudentNotices: vi.fn(() => Promise.resolve([])),
  getStudents: vi.fn(),
  getStudentMatches: vi.fn(),
  findGuardians: vi.fn(),
  saveStudent: vi.fn(),
  saveRelationship: vi.fn(),
  endRelationship: vi.fn(),
  getPersonRecord: vi.fn(),
  getPersonHistory: vi.fn(),
  changePhoto: vi.fn(),
  getSiblings: vi.fn(() => Promise.resolve([])),
  saveContacts: vi.fn(),
  searchPeople: vi.fn(),
}));

const STUDENT = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a01";
const MOTHER = "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a05";

function guardian(
  relationshipId: string,
  userId: string,
  fullNameEn: string,
): NonNullable<StudentData["guardians"]>[number] {
  return {
    relationshipId,
    version: 3,
    userId,
    fullNameEn,
    fullNameAr: null,
    relationId: MOTHER,
    relationMeaning: "mother",
    legalGuardian: true,
    portalAccess: true,
    receivesNotifications: true,
    primaryContact: true,
    emergencyContact: false,
    contactPriority: 1,
    residence: "primary",
    pickup: "allowed",
    educationalRights: "full",
    communicationIsolated: false,
    accessBasis: "parental_authority",
    from: "2024-09-01",
    hasAccount: true,
    contacts: [],
  };
}

const RECORD: StudentData = {
  id: STUDENT,
  version: 1,
  givenNameAr: null,
  middleNameAr: null,
  familyNameAr: null,
  fullNameAr: null,
  givenNameEn: "Salama",
  middleNameEn: null,
  familyNameEn: "Ashoush",
  fullNameEn: "Salama Ashoush",
  preferredGivenName: null,
  birthDate: null,
  sexId: null,
  photoFileId: null,
  medicalAlert: false,
  custodyAlert: false,
  createdAt: new Date("2024-09-01T00:00:00Z"),
  reference: "TEST-0001",
  status: "enrolled",
  placement: null,
  placements: [],
  homeroom: null,
  accessUntil: null,
  guardians: [
    guardian(
      "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a10",
      "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a11",
      "Salama Hassan",
    ),
    guardian(
      "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a12",
      "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a13",
      "Mona Ashoush",
    ),
  ],
  account: null,
  workingYearId: null,
  today: "2026-09-27",
  noPhotos: false,
  access: {
    manage: true,
    consents: false,
    identifiers: false,
    contacts: true,
    health: false,
    support: false,
    demographics: false,
    custody: false,
    history: false,
    attendance: false,
    timetable: false,
    message: false,
    coursework: false,
    skills: false,
  },
};

function renderRecord() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={null}>
            <StudentRecord studentId={STUDENT} tab="family" onTab={vi.fn()} />
          </Suspense>
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("student guardians", () => {
  beforeEach(() => {
    vi.mocked(getStudentRecord).mockResolvedValue(RECORD);
    vi.mocked(getPeopleOptions).mockResolvedValue({
      grades: [],
      relations: [
        {
          id: MOTHER,
          code: "mother",
          meaning: "mother",
          labelEn: "Mother",
          labelAr: "الأم",
          color: null,
          sortOrder: 0,
          schoolOnly: false,
        },
      ],
      sexes: [],
      positions: [],
      religions: [],
      entryTypes: [],
      exitTypes: [],
      years: [],
      workingYearId: null,
    });
    vi.mocked(endRelationship).mockResolvedValue({ ended: true });
  });

  it("names the guardian and asks before ending a link, even when another guardian stays", async () => {
    const user = userEvent.setup();
    renderRecord();
    await user.click(
      await screen.findByRole("button", { name: "Actions for Salama Hassan" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "End link" }));

    const confirm = await screen.findByRole("dialog", {
      name: "End Salama Hassan's link to this student?",
    });
    expect(endRelationship).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "End link" }));

    await waitFor(() => expect(endRelationship).toHaveBeenCalledOnce());
    expect(endRelationship).toHaveBeenCalledWith({
      data: {
        relationshipId: "0b6f6a58-3f7e-4d51-9b1d-6f1f0f7f1a10",
        expectedVersion: 3,
      },
    });
  });
});
