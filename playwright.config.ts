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

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  // Specs of systems rebuilt on the cell. The rest still drive the per-school
  // API those systems replace, and join this list as each system lands.
  testMatch: [
    "auth.spec.ts",
    "people.spec.ts",
    "classes.spec.ts",
    "years.spec.ts",
    "rollover.spec.ts",
    "coursework.spec.ts",
    "attendance.spec.ts",
    "timetable.spec.ts",
    "messages.spec.ts",
    "announcements.spec.ts",
    "news.spec.ts",
    "calendar.spec.ts",
    "notifications.spec.ts",
    "collaboration.spec.ts",
    "learning.spec.ts",
    "projects.spec.ts",
    "puzzles.spec.ts",
    "microbit.spec.ts",
    "scratch.spec.ts",
    "print.spec.ts",
    "young.spec.ts",
    "badges.spec.ts",
    "site.spec.ts",
    "admissions.spec.ts",
    "hosts.spec.ts",
    "sign-in-page.spec.ts",
    "bare-domain.spec.ts",
    "home.spec.ts",
    "search.spec.ts",
    "privacy.spec.ts",
    "consents.spec.ts",
    "i18n.spec.ts",
  ],
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
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
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
      env: { API_PORT: apiPort },
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
  ],
});
