import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SectionCard } from "~/components/app/primitives";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "~/components/ui/field";
import * as m from "~/i18n/messages";
import { schoolFeaturesQuery } from "~/queries/learning";
import { setSchoolFeature } from "~/server/learning";
import { getMessageFromError } from "~/utils/error";

export function FeaturesCard() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(schoolFeaturesQuery);
  const save = useServerFn(setSchoolFeature);
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      save({ data: { key: "elearning", enabled } }),
    onSuccess: async (features) => {
      queryClient.setQueryData(schoolFeaturesQuery.queryKey, features);
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      await queryClient.invalidateQueries({ queryKey: ["learning"] });
      toast.success(m.managementSaved());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <SectionCard
      title={m.learningFeatureTitle()}
      description={m.learningFeatureHint()}
    >
      <Field orientation="horizontal">
        <Checkbox
          id="feature-elearning"
          checked={data.elearning}
          disabled={mutation.isPending}
          onCheckedChange={(next) => mutation.mutate(next)}
        />
        <FieldContent>
          <FieldLabel htmlFor="feature-elearning">
            {m.learningFeatureToggle()}
          </FieldLabel>
          <FieldDescription>{m.learningFeatureToggleHint()}</FieldDescription>
        </FieldContent>
      </Field>
    </SectionCard>
  );
}
