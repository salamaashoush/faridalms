import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { NewSchoolInput } from "./provisioning";

import { BASIC_ENTITLEMENTS, settableOf } from "./plans";
import {
  newSchoolSchema,
  provisionTenantSchema,
  RESERVED_SLUGS,
  reissueInviteSchema,
  slugSchema,
} from "./provisioning";

const school: NewSchoolInput = {
  kind: "school",
  cellId: "eg-1",
  defaultLocale: "ar",
  jurisdictions: ["eg"],
  schools: [
    {
      nameEn: "  Northwind Academy ",
      nameAr: "",
      slug: " Northwind ",
      timeZone: "Africa/Cairo",
      countryCode: "eg",
    },
  ],
  administrator: {
    givenNameEn: "Salama",
    familyNameEn: "Ashoush",
    email: " Salama@Northwind.Example.com ",
  },
};

const issues = (input: unknown) => {
  const result = v.safeParse(newSchoolSchema, input);
  return result.success ? {} : v.flatten(result.issues);
};

describe("a new school", () => {
  it("normalises what the operator typed and names a standalone tenant after its school", () => {
    const spec = v.parse(newSchoolSchema, school);
    expect(spec).toMatchObject({
      nameEn: "Northwind Academy",
      nameAr: null,
      jurisdictions: ["EG"],
      schools: [
        {
          nameEn: "Northwind Academy",
          nameAr: null,
          slug: "northwind",
          countryCode: "EG",
        },
      ],
      administrator: {
        givenNameEn: "Salama",
        givenNameAr: null,
        email: "salama@northwind.example.com",
      },
      entitlements: settableOf(BASIC_ENTITLEMENTS),
    });
    expect(v.parse(newSchoolSchema, spec)).toEqual(spec);
  });

  it("refuses every reserved address and anything that is not one DNS label", () => {
    // The names the edge routes to the platform's own services.
    for (const slug of [
      "www",
      "api",
      "ops",
      "collab",
      "files",
      "media",
      "play",
    ])
      expect(RESERVED_SLUGS.has(slug)).toBe(true);
    for (const slug of RESERVED_SLUGS)
      expect(v.safeParse(slugSchema, slug).success).toBe(false);
    for (const slug of ["-north", "north-", "north_wind", "a".repeat(65), ""])
      expect(v.safeParse(slugSchema, slug).success).toBe(false);
    for (const slug of ["a", "north-wind", "school2", "a".repeat(64)])
      expect(v.safeParse(slugSchema, slug).success).toBe(true);
    expect(
      issues({
        ...school,
        schools: [{ ...school.schools[0], slug: "admin" }],
      }).nested?.["schools.0.slug"],
    ).toEqual(["The platform uses this address itself."]);
  });

  it("needs a name for the school and the administrator, an IANA zone and a real email", () => {
    const flat = issues({
      ...school,
      schools: [
        {
          ...school.schools[0],
          nameEn: " ",
          nameAr: null,
          timeZone: "Cairo",
        },
      ],
      administrator: { email: "not an address" },
    });
    expect(flat.nested).toMatchObject({
      "schools.0.nameEn": ["Give the school a name in English or Arabic."],
      "schools.0.timeZone": ["Use an IANA time zone, such as Africa/Cairo."],
      "administrator.email": ["Enter an email address."],
    });
    expect(
      issues({
        ...school,
        schools: [{ ...school.schools[0], timeZone: "Mars/Olympus" }],
      }).nested?.["schools.0.timeZone"],
    ).toBeDefined();
    expect(
      issues({
        ...school,
        schools: [{ ...school.schools[0], nameEn: "x".repeat(161) }],
      }).nested?.["schools.0.nameEn"],
    ).toEqual(["Keep it to 160 characters."]);
  });

  it("holds a standalone school to one school, and a group to its own name and distinct addresses", () => {
    const second = { ...school.schools[0], slug: "southwind" };
    expect(
      issues({ ...school, schools: [school.schools[0], second] }).nested
        ?.schools,
    ).toEqual(["A standalone school has exactly one school."]);
    const group = {
      ...school,
      kind: "school_group",
      schools: [school.schools[0], { ...second, slug: "northwind" }],
    };
    expect(issues(group).nested).toMatchObject({
      nameEn: ["Give the group a name in English or Arabic."],
      schools: ["Give each school its own address."],
    });
    const spec = v.parse(newSchoolSchema, {
      ...group,
      nameAr: "مجموعة الشمال",
      schools: [school.schools[0], second],
    });
    expect(spec).toMatchObject({ nameEn: null, nameAr: "مجموعة الشمال" });
    expect(
      issues({ ...school, jurisdictions: ["EG", "eg"] }).nested?.jurisdictions,
    ).toEqual(["Name each jurisdiction once."]);
  });

  it("needs one id per school when the console calls the cell, and an optional email for a new link", () => {
    const spec = v.parse(newSchoolSchema, school);
    const tenantId = "0195f3a0-0000-7000-8000-000000000001";
    expect(
      v.safeParse(provisionTenantSchema, { tenantId, schoolIds: [], spec })
        .success,
    ).toBe(false);
    expect(
      v.safeParse(provisionTenantSchema, {
        tenantId,
        schoolIds: [tenantId],
        spec,
      }).success,
    ).toBe(true);
    expect(
      v.parse(reissueInviteSchema, { tenantId, schoolId: tenantId }).email,
    ).toBeNull();
  });
});
