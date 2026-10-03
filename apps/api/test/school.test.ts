import { describe, expect, test } from "bun:test";

import { login, raw, sessionFor } from "./harness";

const png = new Blob([
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
]);

describe("the school's logo", () => {
  test("prints on the school's paper: the office sets it and every member may open it", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const file = await office.api.files.initiate({
      purpose: "document_media",
      name: "logo.png",
      mediaType: "image/png",
      sizeBytes: png.size,
    });
    await raw("northwind", office.token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: png,
    });
    const profile = await office.api.school.profile();
    const saved = await office.api.school.saveProfile({
      expectedVersion: profile.version,
      nameEn: profile.nameEn ?? "",
      nameAr: profile.nameAr ?? "",
      identifier: profile.identifier ?? "",
      timeZone: profile.timeZone ?? "Africa/Cairo",
      defaultLocale: profile.defaultLocale ?? "ar",
      weekStart: profile.weekStart,
      weekendDays: profile.weekendDays,
      secondaryCalendar: profile.secondaryCalendar ?? "",
      phone: profile.phone ?? "",
      email: profile.email ?? "",
      websiteUrl: profile.websiteUrl ?? "",
      logoFileId: file.id,
    });
    const parent = await sessionFor(
      "northwind",
      login("student").replace("student", "parent"),
    );
    expect((await parent.api.identity.currentUser()).school.logoFileId).toBe(
      file.id,
    );
    const opened = await raw(
      "northwind",
      parent.token,
      `/v1/files/${file.id}/content`,
    );
    expect(opened.status).toBe(200);

    // A save that leaves the logo out keeps it.
    await office.api.school.saveProfile({
      expectedVersion: saved.version,
      nameEn: profile.nameEn ?? "",
      nameAr: profile.nameAr ?? "",
      identifier: profile.identifier ?? "",
      timeZone: profile.timeZone ?? "Africa/Cairo",
      defaultLocale: profile.defaultLocale ?? "ar",
      weekStart: profile.weekStart,
      weekendDays: profile.weekendDays,
      secondaryCalendar: profile.secondaryCalendar ?? "",
      phone: profile.phone ?? "",
      email: profile.email ?? "",
      websiteUrl: profile.websiteUrl ?? "",
    });
    expect((await office.api.school.profile()).logoFileId).toBe(file.id);
  });
});
