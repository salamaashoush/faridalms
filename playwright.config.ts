import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

// The gate runs on its own ports so it can share the machine with `bun run dev`.
const webPort = process.env.E2E_WEB_PORT ?? "3200";
const apiPort = process.env.E2E_API_PORT ?? "3201";
const collabPort = process.env.E2E_COLLAB_PORT ?? "3202";
// The API serves the files host, where students' pages play, two ports up.
const filesPort = String(Number(apiPort) + 2);
const opsPort = process.env.E2E_OPS_PORT ?? "3206";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  // A CI runner has two cores for the server and two browsers, where Firefox
  // and WebKit take several times Chromium's time over a multi-page flow.
  timeout: process.env.CI ? 90_000 : 30_000,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 2 : 4,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    // Northwind's portal: a school signs people in only on its own host, and
    // the server answers every *.localhost name. Specs of the bare portal
    // domain reach it at localhost.
    baseURL: `http://northwind.localhost:${webPort}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      testIgnore: "console/**",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      testIgnore: "console/**",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      testIgnore: "console/**",
      use: { ...devices["Desktop Safari"] },
    },

    // The operator console, on its own host; operators use it on a desktop.
    // Its first operator to sign in becomes the owner, so that sign-in runs
    // before every other console spec.
    {
      name: "console-owner",
      testMatch: "console/owner.setup.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${opsPort}`,
      },
    },
    // The daily round publishes and bills every tenant at once, so a spec
    // that runs it would take a change another spec is about to publish by
    // hand. Console specs run one at a time.
    {
      name: "console",
      testMatch: "console/**/*.spec.ts",
      dependencies: ["console-owner"],
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${opsPort}`,
      },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
  webServer: [
    {
      command: "bun apps/api/src/index.ts",
      url: `http://127.0.0.1:${apiPort}/health/ready`,
      env: {
        API_PORT: apiPort,
        COLLAB_SIGNAL_URL: `http://127.0.0.1:${collabPort}/signal`,
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "bun apps/collab/src/index.ts",
      url: `http://127.0.0.1:${collabPort}/health/live`,
      env: { COLLAB_PORT: collabPort },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "bun run build && bun run start",
      url: `http://127.0.0.1:${webPort}/api/health`,
      env: {
        PORT: webPort,
        API_URL: `http://127.0.0.1:${apiPort}`,
        BACKEND_URL: `http://127.0.0.1:${apiPort}`,
        COLLAB_URL: `ws://127.0.0.1:${collabPort}`,
        PLAY_URL: `http://127.0.0.1:${filesPort}`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "bun run --cwd apps/ops build && bun run --cwd apps/ops start",
      url: `http://127.0.0.1:${opsPort}/sign-in`,
      env: { PORT: opsPort },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
