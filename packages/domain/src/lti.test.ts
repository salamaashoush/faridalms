import { describe, expect, it } from "vitest";

import {
  LTI_AGS_SCOPES,
  LTI_MOST_PICKED,
  LTI_NRPS_SCOPE,
  LTI_TOOL_CONFIGURATION,
  ltiPickedOf,
  ltiPickOf,
  ltiScopesOf,
  toolRegistrationOf,
} from "./lti";

describe("content a tool hands back", () => {
  it("takes a resource link as a link's fields, cut to fit", () => {
    expect(
      ltiPickOf({
        type: "ltiResourceLink",
        title: `  ${"Flood ".repeat(50)}`,
        text: "  A river in flood.  ",
        url: "https://tool.example.com/sims/flood",
        custom: { sim: "flood" },
        lineItem: { scoreMaximum: 10, tag: "sim" },
        window: { targetName: "sims" },
      }),
    ).toEqual({
      title: "Flood ".repeat(50).trim().slice(0, 200),
      text: "A river in flood.",
      url: "https://tool.example.com/sims/flood",
      custom: { sim: "flood" },
      lineItem: {
        label: "Flood ".repeat(50).trim().slice(0, 200),
        scoreMaximum: 10,
        tag: "sim",
      },
    });
  });

  it("gives nothing for other kinds of content or broken items", () => {
    expect(ltiPickOf({ type: "link", url: "https://example.com" })).toBeNull();
    expect(
      ltiPickOf({ type: "ltiResourceLink", url: "http://tool.example.com" }),
    ).toBeNull();
    expect(
      ltiPickOf({ type: "ltiResourceLink", custom: { sim: 3 } }),
    ).toBeNull();
    expect(
      ltiPickOf({ type: "ltiResourceLink", lineItem: { scoreMaximum: 0 } }),
    ).toBeNull();
    expect(ltiPickOf({ type: "ltiResourceLink" })).toEqual({ title: "" });
  });
});

describe("several pieces of content a tool hands back", () => {
  it("places links, addresses and HTML, and counts what it cannot", () => {
    expect(
      ltiPickedOf([
        {
          type: "ltiResourceLink",
          title: "Tides",
          iframe: { height: 120 },
        },
        {
          type: "link",
          url: "https://example.com/a",
          embed: { html: "<iframe src='https://example.com/a'></iframe>" },
        },
        { type: "html", html: "" },
        { type: "image", url: "https://example.com/a.png" },
        "not an item",
      ]),
    ).toEqual({
      picked: [
        { type: "lti", pick: { title: "Tides", frame: { height: 200 } } },
        {
          type: "html",
          html: "<iframe src='https://example.com/a'></iframe>",
          title: "",
        },
      ],
      refused: 3,
    });
  });

  it("takes at most twenty, and nothing from what is not a list", () => {
    const many = Array.from({ length: LTI_MOST_PICKED + 5 }, () => ({
      type: "link",
      url: "https://example.com",
    }));
    const { picked, refused } = ltiPickedOf(many);
    expect(picked).toHaveLength(LTI_MOST_PICKED);
    expect(refused).toBe(5);
    expect(ltiPickedOf(undefined)).toEqual({ picked: [], refused: 0 });
  });
});

describe("the services a tool is given", () => {
  it("names the grade scopes and the class list as the school allows", () => {
    expect(ltiScopesOf({ grades: false, roster: false })).toEqual([]);
    expect(ltiScopesOf({ grades: true, roster: true })).toEqual([
      ...Object.values(LTI_AGS_SCOPES),
      LTI_NRPS_SCOPE,
    ]);
  });
});

const request = (change: Record<string, unknown> = {}) => ({
  grant_types: ["client_credentials", "implicit"],
  response_types: ["id_token"],
  initiate_login_uri: "https://lti.garden.example.org/login",
  redirect_uris: ["https://garden.example.org/launch"],
  client_name: "  Garden  ",
  jwks_uri: "https://keys.example.net/jwks",
  token_endpoint_auth_method: "private_key_jwt",
  scope: LTI_NRPS_SCOPE,
  [LTI_TOOL_CONFIGURATION]: {
    domain: "Garden.example.org",
    target_link_uri: "https://garden.example.org/launch",
    messages: [
      {
        type: "LtiSubmissionReviewRequest",
        target_link_uri: "https://garden.example.org/review",
      },
    ],
  },
  ...change,
});

describe("a tool registering itself", () => {
  it("reads what it asks for, giving it neither names nor the class list", () => {
    const read = toolRegistrationOf(request());
    expect(read).toMatchObject({
      tool: {
        name: "Garden",
        loginUrl: "https://lti.garden.example.org/login",
        launchUrl: "https://garden.example.org/launch",
        jwksUrl: "https://keys.example.net/jwks",
        deepLinkUrl: "",
        reviewUrl: "https://garden.example.org/review",
        sendNames: false,
        grades: false,
        roster: false,
      },
      registration: {
        domain: "garden.example.org",
        asked: { grades: false, roster: true },
      },
    });
  });

  it("refuses addresses outside its domains and what LTI does not allow", () => {
    expect(
      toolRegistrationOf(
        request({
          initiate_login_uri: "https://garden.example.org.evil.com/login",
        }),
      ),
    ).toEqual({ error: "invalid_redirect_uri" });
    expect(
      toolRegistrationOf(
        request({ redirect_uris: ["http://garden.example.org/launch"] }),
      ),
    ).toEqual({ error: "invalid_client_metadata" });
    expect(toolRegistrationOf(request({ grant_types: ["implicit"] }))).toEqual({
      error: "invalid_client_metadata",
    });
    expect(toolRegistrationOf("not json")).toEqual({
      error: "invalid_client_metadata",
    });
  });
});
