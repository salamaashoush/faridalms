import { Checkbox } from "@faridalms/ui/checkbox";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";

import * as m from "~/i18n/messages";
import { pictureSourcesQuery } from "~/queries/school-settings";
import { setCommonsPictures } from "~/server/school-settings";
import { getMessageFromError } from "~/utils/error";

/**
 * Whether the school's staff may search Wikimedia Commons for pictures.
 * Off until an administrator turns it on; students and families never see it.
 */
export function CommonsPictures() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(pictureSourcesQuery);
  const [enabled, setEnabled] = useState(data.commons);
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: () => setCommonsPictures({ data: { enabled } }),
    meta: { inlineError: true },
    onSuccess: async (sources) => {
      queryClient.setQueryData(pictureSourcesQuery.queryKey, sources);
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      setSaved(true);
    },
  });
  return (
    <SettingsSection
      title={m.settingsCommons()}
      description={m.settingsCommonsHint()}
      onSubmit={() => {
        setSaved(false);
        return mutation.mutateAsync().then(
          () => undefined,
          () => undefined,
        );
      }}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      saved={saved && enabled === data.commons}
      isDirty={() => enabled !== data.commons}
    >
      <div className="flex items-center gap-3">
        {/* Base UI's checkbox is a span, so the fieldset the section
            disables while saving does not reach it. */}
        <Checkbox
          id="commons-pictures"
          className="max-md:after:-inset-3"
          disabled={mutation.isPending}
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <label
          htmlFor="commons-pictures"
          className="text-sm leading-5 font-medium max-md:flex max-md:min-h-10 max-md:flex-1 max-md:items-center"
        >
          {m.settingsCommonsLabel()}
        </label>
      </div>
      {saved && enabled === data.commons ? (
        <output className="sr-only">
          {data.commons ? m.settingsCommonsOn() : m.settingsCommonsOff()}
        </output>
      ) : null}
    </SettingsSection>
  );
}
