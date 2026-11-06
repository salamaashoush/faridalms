import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { FormField, TextField } from "@faridalms/ui/system/form-field";
import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";
import {
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { ltiToolsQuery } from "~/queries/lti";
import { removeLtiTool, saveLtiTool } from "~/server/lti";
import { getMessageFromError } from "~/utils/error";

type Data = Awaited<ReturnType<NonNullable<(typeof ltiToolsQuery)["queryFn"]>>>;
type Tool = Data["tools"][number];

interface CopyableProps {
  label: string;
  value: string;
}

/** A value a tool's maker copies into their side of the registration. */
function Copyable({ label, value }: CopyableProps) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="text-[13px] leading-[18px] text-muted-foreground">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1">
        <code dir="ltr" className="min-w-0 truncate text-[13px] leading-5">
          {value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={m.ltiCopy({ what: label })}
          className="max-md:size-10"
          onClick={() =>
            void navigator.clipboard
              .writeText(value)
              .then(() => toast.success(m.ltiCopied()))
          }
        >
          <Copy aria-hidden />
        </Button>
      </span>
    </div>
  );
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

interface ToolSheetProps {
  open: boolean;
  tool: Tool | null;
  onClose: () => void;
}

function ToolSheet({ open, tool, onClose }: ToolSheetProps) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveLtiTool);
  const [name, setName] = useState(tool?.name ?? "");
  const [loginUrl, setLoginUrl] = useState(tool?.loginUrl ?? "");
  const [launchUrl, setLaunchUrl] = useState(tool?.launchUrl ?? "");
  const [redirects, setRedirects] = useState(
    tool?.redirectUrls.join("\n") ?? "",
  );
  const [jwksUrl, setJwksUrl] = useState(tool?.jwksUrl ?? "");
  const [deepLinkUrl, setDeepLinkUrl] = useState(tool?.deepLinkUrl ?? "");
  const [sendNames, setSendNames] = useState(tool?.sendNames ?? false);
  const [custom, setCustom] = useState(
    Object.entries(tool?.custom ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  const saving = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...(tool ? { id: tool.id, expectedVersion: tool.version } : {}),
          name,
          loginUrl,
          launchUrl,
          // A tool with one launch address posts its launches back to it.
          redirectUrls: lines(redirects).length
            ? lines(redirects)
            : [launchUrl.trim()],
          jwksUrl,
          deepLinkUrl,
          sendNames,
          custom: Object.fromEntries(
            lines(custom).map((line) => {
              const at = line.indexOf("=");
              return at < 0
                ? [line, ""]
                : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
            }),
          ),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lti"] });
      onClose();
    },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={tool ? m.ltiEditTool() : m.ltiAddTool()}
      pending={saving.isPending}
      error={saving.error ? getMessageFromError(saving.error) : null}
      onSubmit={() => saving.mutate()}
    >
      <TextField
        label={m.ltiToolName()}
        value={name}
        maxLength={120}
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        label={m.ltiLoginUrl()}
        hint={m.ltiLoginUrlHint()}
        type="url"
        dir="ltr"
        value={loginUrl}
        onChange={(event) => setLoginUrl(event.target.value)}
      />
      <TextField
        label={m.ltiLaunchUrl()}
        hint={m.ltiLaunchUrlHint()}
        type="url"
        dir="ltr"
        value={launchUrl}
        onChange={(event) => setLaunchUrl(event.target.value)}
      />
      <FormField
        label={m.ltiRedirectUrls()}
        hint={m.ltiRedirectUrlsHint()}
        optional
      >
        {(control) => (
          <Textarea
            {...control}
            dir="ltr"
            rows={3}
            value={redirects}
            onChange={(event) => setRedirects(event.target.value)}
          />
        )}
      </FormField>
      <TextField
        label={m.ltiJwksUrl()}
        hint={m.ltiJwksUrlHint()}
        type="url"
        dir="ltr"
        value={jwksUrl}
        onChange={(event) => setJwksUrl(event.target.value)}
      />
      <TextField
        label={m.ltiDeepLinkUrl()}
        hint={m.ltiDeepLinkUrlHint()}
        optional
        type="url"
        dir="ltr"
        value={deepLinkUrl}
        onChange={(event) => setDeepLinkUrl(event.target.value)}
      />
      <CheckboxRow
        label={m.ltiSendNames()}
        hint={m.ltiSendNamesHint()}
        checked={sendNames}
        onChange={setSendNames}
      />
      <FormField label={m.ltiCustom()} hint={m.ltiCustomHint()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="ltr"
            rows={3}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

/**
 * The school's outside tools, launched by LTI 1.3 from lessons and briefs:
 * what each tool's maker needs of the school, and each registered tool
 * with the ids the school gave it.
 */
export function OutsideTools() {
  const data = useSuspenseQuery(ltiToolsQuery).data;
  const queryClient = useQueryClient();
  const remove = useServerFn(removeLtiTool);
  const [sheet, setSheet] = useState<{
    key: number;
    open: boolean;
    tool: Tool | null;
  }>({ key: 0, open: false, tool: null });
  const [removing, setRemoving] = useState<Tool | null>(null);
  const removal = useMutation({
    mutationFn: (tool: Tool) => remove({ data: { id: tool.id } }),
    onSuccess: async () => {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ["lti"] });
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const open = (tool: Tool | null) =>
    setSheet((current) => ({ key: current.key + 1, open: true, tool }));
  return (
    <SettingsPage>
      <SettingsSection
        title={m.ltiTools()}
        description={m.ltiToolsHint()}
        footer={
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => open(null)}
          >
            <Plus aria-hidden />
            {m.ltiAddTool()}
          </Button>
        }
      >
        {data.tools.length === 0 ? (
          <RecordEmpty>{m.ltiNoTools()}</RecordEmpty>
        ) : (
          <RecordList>
            {data.tools.map((tool) => (
              <li key={tool.id} className="grid gap-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="text-sm leading-5 font-medium" dir="auto">
                      {tool.name}
                    </span>
                    <span
                      dir="ltr"
                      className="truncate text-[13px] leading-[18px] text-muted-foreground"
                    >
                      {tool.launchUrl}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="max-md:h-10"
                      onClick={() => open(tool)}
                    >
                      <Pencil aria-hidden />
                      {m.ltiEditTool()}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={m.ltiRemoveTool({ name: tool.name })}
                      className="max-md:size-10"
                      onClick={() => setRemoving(tool)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Copyable label={m.ltiClientId()} value={tool.clientId} />
                  <Copyable
                    label={m.ltiDeploymentId()}
                    value={tool.deploymentId}
                  />
                </div>
              </li>
            ))}
          </RecordList>
        )}
      </SettingsSection>
      <SettingsSection
        title={m.ltiPlatform()}
        description={m.ltiPlatformHint()}
      >
        <div className="grid gap-3">
          <Copyable label={m.ltiIssuer()} value={data.platform.issuer} />
          <Copyable label={m.ltiKeysUrl()} value={data.platform.jwksUrl} />
          <Copyable label={m.ltiAuthUrl()} value={data.platform.authUrl} />
          <Copyable label={m.ltiTokenUrl()} value={data.platform.tokenUrl} />
        </div>
      </SettingsSection>
      {sheet.key > 0 ? (
        <ToolSheet
          key={sheet.key}
          open={sheet.open}
          tool={sheet.tool}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={m.ltiRemoveTitle({ name: removing?.name ?? "" })}
        body={m.ltiRemoveBody()}
        confirmLabel={m.ltiRemove()}
        pending={removal.isPending}
        onConfirm={() => removing && removal.mutate(removing)}
        onCancel={() => setRemoving(null)}
      />
    </SettingsPage>
  );
}
