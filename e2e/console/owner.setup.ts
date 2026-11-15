import { expect, test as setup } from "@playwright/test";

import { OWNER, publishAgreements, signInAs } from "../fixtures/console";

// The first operator to sign in owns the console, so the owner signs in
// before any other spec does.
setup("the first operator to sign in owns the console", async ({ page }) => {
  await signInAs(page, OWNER);
  await expect(page.getByRole("link", { name: "Operators" })).toBeVisible();
  // Every school created needs the data processing agreement accepted.
  await publishAgreements(page);
});
