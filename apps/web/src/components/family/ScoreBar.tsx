import { Progress } from "@faridalms/ui/progress";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

/**
 * A score as a bar, on the shared Progress primitive rather than a chart
 * library: one value on one axis, and a progressbar role is readable where a
 * canvas is not.
 */
export function ScoreBar({
  subject,
  percent,
}: {
  subject: string;
  percent: number;
}) {
  return (
    <Progress
      value={percent}
      aria-label={m.familySubjectScore({
        subject,
        percent: formatNumber(percent),
      })}
    />
  );
}
