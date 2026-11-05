import {
  customerById,
  linkTenant,
  saveCustomer,
} from "@faridalms/database/business/customers";
import {
  abandonDraft,
  draftById,
  finishDraft,
  openDrafts,
  recordProgress,
  saveDraft,
  startDraft,
} from "@faridalms/database/business/drafts";
import { blankDraft } from "@faridalms/domain/provisioning-draft";
import { describe, expect, test } from "bun:test";

import { business } from "./harness";

const OWNER = "op-owner";

describe("a draft of a new school", () => {
  test("is saved step by step, refuses a stale save, and keeps how far creating it went", async () => {
    const spec = blankDraft({ cellId: "eg-1", trialEndsOn: "2026-12-05" });
    const id = await startDraft(business(), { spec, by: OWNER });
    const customerId = await saveCustomer(business(), {
      legalNameEn: "Larch Schools",
      legalNameAr: null,
      taxNumber: null,
      commercialRegistry: null,
      address: null,
      country: "EG",
      currency: "EGP",
      reason: "Met at the fair",
      by: OWNER,
    });
    if (!customerId) throw new Error("customer");

    const [first] = spec.tenant.schools;
    const named = {
      ...spec,
      tenant: { ...spec.tenant, schools: [{ ...first, slug: "larch" }] },
    };
    expect(
      await saveDraft(business(), {
        id,
        expectedVersion: 1,
        step: "plan",
        customerId,
        spec: named,
        by: OWNER,
      }),
    ).toBe(2);
    expect(
      await saveDraft(business(), {
        id,
        expectedVersion: 1,
        step: "plan",
        customerId,
        spec,
        by: OWNER,
      }),
    ).toBeNull();
    expect(
      (await openDrafts(business())).find((row) => row.draft.id === id),
    ).toMatchObject({ customerName: "Larch Schools", draft: { step: "plan" } });

    const tenantId = crypto.randomUUID();
    await recordProgress(business(), id, {
      tenantId,
      schoolIds: [tenantId],
    });
    await recordProgress(business(), id, { subscriptionId: tenantId });
    expect(await draftById(business(), id)).toMatchObject({
      tenantId,
      progress: { tenantId, schoolIds: [tenantId], subscriptionId: tenantId },
      spec: { tenant: { schools: [{ slug: "larch" }] } },
    });

    // Once creating it began, it is finished rather than set aside.
    expect(
      await abandonDraft(business(), { id, by: OWNER, reason: "Lost" }),
    ).toBe(false);
    expect(
      await linkTenant(business(), { customerId, tenantId, by: OWNER }),
    ).toBe(true);
    expect(
      await linkTenant(business(), {
        customerId,
        tenantId: crypto.randomUUID(),
        by: OWNER,
      }),
    ).toBe(false);
    expect(
      (await customerById(business(), customerId))?.customer.tenantId,
    ).toBe(tenantId);
    await finishDraft(business(), { id, tenantId, by: OWNER });
    expect((await draftById(business(), id))?.state).toBe("created");
    expect(
      (await openDrafts(business())).some((row) => row.draft.id === id),
    ).toBe(false);
  });

  test("not yet begun, is set aside", async () => {
    const id = await startDraft(business(), {
      spec: blankDraft({ cellId: "eg-1", trialEndsOn: "2026-12-05" }),
      by: OWNER,
    });
    expect(
      await abandonDraft(business(), {
        id,
        by: OWNER,
        reason: "The school chose another platform",
      }),
    ).toBe(true);
    expect((await draftById(business(), id))?.state).toBe("abandoned");
  });
});
