import { describe, expect, it } from "vitest";

import { movedAddress } from "./moved-addresses";

describe("an address from before staff worked in one area", () => {
  it("lands on today from either area's home", () => {
    expect(movedAddress("admin", "/admin", "")).toBe("/today");
    expect(movedAddress("teach", "/teach/", "")).toBe("/today");
  });

  it("lands on the page that took its place, its search kept", () => {
    expect(movedAddress("teach", "/teach/gradebook", "?classId=abc")).toBe(
      "/gradebook?classId=abc",
    );
    expect(movedAddress("teach", "/teach/board/123", "")).toBe("/board/123");
    expect(movedAddress("admin", "/admin/site", "")).toBe("/website");
    expect(movedAddress("admin", "/admin/site-page-editor", "?id=7")).toBe(
      "/site-page-editor?id=7",
    );
  });

  it("opens a merged page on the side the old address showed", () => {
    expect(movedAddress("admin", "/admin/classes", "")).toBe(
      "/classes?scope=all",
    );
    expect(movedAddress("teach", "/teach/classes", "")).toBe(
      "/classes?scope=mine",
    );
    expect(movedAddress("teach", "/teach/attendance", "?date=2026-11-02")).toBe(
      "/attendance?date=2026-11-02&tab=mine",
    );
    expect(movedAddress("admin", "/admin/attendance", "?tab=desk")).toBe(
      "/attendance?tab=desk",
    );
    expect(movedAddress("admin", "/admin/timetable", "")).toBe(
      "/timetable?view=classes",
    );
  });
});
