import { Badge } from "@faridalms/ui/badge";
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
import { Check, Copy, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { ltiToolsQuery } from "~/queries/lti";
import {
  activateLtiTool,
  removeLtiTool,
  saveLtiTool,
  startLtiRegistration,
} from "~/server/lti";
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

interface AskedProps {
  registration: NonNullable<Tool["registration"]>;
}

/** What a tool that registered itself asked of the school, for an administrator to weigh. */
function Asked({ registration }: AskedProps) {
  const services = [
    ...(registration.asked.grades ? [m.ltiGrades()] : []),
    ...(registration.asked.roster ? [m.ltiRoster()] : []),
  ];
  const details = registration.claims.filter(
    (claim) => !["iss", "sub", "aud", "nonce"].includes(claim),
  );
  const pages = [
    { label: m.ltiAskedHome(), url: registration.homeUrl },
    { label: m.ltiAskedPrivacy(), url: registration.privacyUrl },
    { label: m.ltiAskedTerms(), url: registration.termsUrl },
  ].flatMap(({ label, url }) => (url ? [{ label, url }] : []));
  const rows = [
    {
      label: m.ltiAskedDomain(),
      value: <span dir="ltr">{registration.domain}</span>,
    },
    {
      label: m.ltiAskedServices(),
      value: services.length ? services.join(", ") : m.ltiAskedNothing(),
    },
    {
      label: m.ltiAskedDetails(),
      value: details.length ? (
        <span dir="ltr">{details.join(", ")}</span>
      ) : (
        m.ltiAskedNothing()
      ),
    },
    ...(pages.length
      ? [
          {
            label: m.ltiAskedLinks(),
            value: (
              <span className="flex flex-wrap gap-x-3">
                {pages.map((page) => (
                  <a
                    key={page.label}
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {page.label}
                  </a>
                ))}
              </span>
            ),
          },
        ]
      : []),
  ];
  return (
    <section className="grid gap-2 rounded-md border p-3">
      <h3 className="text-sm leading-5 font-medium">{m.ltiAsked()}</h3>
      {registration.description ? (
        <p className="text-sm leading-5 text-muted-foreground" dir="auto">
          {registration.description}
        </p>
      ) : null}
      <dl className="grid gap-1.5 text-sm leading-5 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

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
  const [reviewUrl, setReviewUrl] = useState(tool?.reviewUrl ?? "");
  const [sendNames, setSendNames] = useState(tool?.sendNames ?? false);
  const [grades, setGrades] = useState(tool?.grades ?? true);
  const [roster, setRoster] = useState(tool?.roster ?? false);
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
          reviewUrl,
          sendNames,
          grades,
          roster,
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
      title={
        tool?.state === "pending"
          ? m.ltiReview()
          : tool
            ? m.ltiEditTool()
            : m.ltiAddTool()
      }
      pending={saving.isPending}
      error={saving.error ? getMessageFromError(saving.error) : null}
      onSubmit={() => saving.mutate()}
    >
      {tool?.registration ? <Asked registration={tool.registration} /> : null}
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
      <TextField
        label={m.ltiReviewUrl()}
        hint={m.ltiReviewUrlHint()}
        optional
        type="url"
        dir="ltr"
        value={reviewUrl}
        onChange={(event) => setReviewUrl(event.target.value)}
      />
      <CheckboxRow
        label={m.ltiSendNames()}
        hint={m.ltiSendNamesHint()}
        checked={sendNames}
        onChange={setSendNames}
      />
      <CheckboxRow
        label={m.ltiGrades()}
        hint={m.ltiGradesHint()}
        checked={grades}
        onChange={setGrades}
      />
      <CheckboxRow
        label={m.ltiRoster()}
        hint={m.ltiRosterHint()}
        checked={roster}
        onChange={setRoster}
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

interface RegisterSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with the window the tool registers itself in. */
  onOpened: (origin: string) => void;
}

/**
 * Starts a tool registering itself, LTI Dynamic Registration: the address
 * its maker gives opens in a window of its own, carrying a token for one
 * registration.
 */
function RegisterSheet({ open, onClose, onOpened }: RegisterSheetProps) {
  const start = useServerFn(startLtiRegistration);
  const [url, setUrl] = useState("");
  const starting = useMutation({
    mutationFn: async () => {
      // The window is opened at once, while the click still allows it.
      const opened = window.open(
        "",
        "lti-registration",
        "popup,width=1024,height=760",
      );
      if (!opened) throw new Error(m.ltiRegisterBlocked());
      try {
        const { url: address } = await start({ data: { url } });
        opened.location.href = address;
        return new URL(address).origin;
      } catch (error) {
        opened.close();
        throw error;
      }
    },
    onSuccess: (origin) => {
      onOpened(origin);
      onClose();
    },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.ltiRegister()}
      submitLabel={m.ltiRegisterOpen()}
      pending={starting.isPending}
      error={starting.error ? getMessageFromError(starting.error) : null}
      onSubmit={() => starting.mutate()}
    >
      <TextField
        label={m.ltiRegisterUrl()}
        hint={m.ltiRegisterUrlHint()}
        type="url"
        dir="ltr"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
    </SheetForm>
  );
}

/**
 * The school's outside tools, launched by LTI 1.3 from lessons and briefs:
 * what each tool's maker needs of the school, each registered tool with
 * the ids the school gave it, and those that registered themselves,
 * waiting to be reviewed and put to use.
 */
export function OutsideTools() {
  const data = useSuspenseQuery(ltiToolsQuery).data;
  const queryClient = useQueryClient();
  const remove = useServerFn(removeLtiTool);
  const activate = useServerFn(activateLtiTool);
  const [registering, setRegistering] = useState({ key: 0, open: false });
  const [waitingOn, setWaitingOn] = useState<string | null>(null);
  // A tool that has registered says so to the window that opened it.
  useEffect(() => {
    const listen = (event: MessageEvent<unknown>) => {
      if (!waitingOn || event.origin !== waitingOn) return;
      const said = event.data as { subject?: unknown } | null;
      if (said?.subject !== "org.imsglobal.lti.close") return;
      setWaitingOn(null);
      toast.success(m.ltiRegistered());
      void queryClient.invalidateQueries({ queryKey: ["lti"] });
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [waitingOn, queryClient]);
  const activation = useMutation({
    mutationFn: (tool: Tool) =>
      activate({ data: { id: tool.id, expectedVersion: tool.version } }),
    onSuccess: async (_, tool) => {
      toast.success(m.ltiActivated({ name: tool.name }));
      await queryClient.invalidateQueries({ queryKey: ["lti"] });
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() => open(null)}
            >
              <Plus aria-hidden />
              {m.ltiAddTool()}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() =>
                setRegistering((current) => ({
                  key: current.key + 1,
                  open: true,
                }))
              }
            >
              <Link2 aria-hidden />
              {m.ltiRegister()}
            </Button>
          </div>
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
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-sm leading-5 font-medium"
                        dir="auto"
                      >
                        {tool.name}
                      </span>
                      {tool.state === "pending" ? (
                        <Badge variant="secondary">{m.ltiPending()}</Badge>
                      ) : null}
                    </span>
                    <span
                      dir="ltr"
                      className="truncate text-[13px] leading-[18px] text-muted-foreground"
                    >
                      {tool.launchUrl}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {tool.state === "pending" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="max-md:h-10"
                        aria-label={m.ltiActivateFor({ name: tool.name })}
                        disabled={activation.isPending}
                        onClick={() => activation.mutate(tool)}
                      >
                        <Check aria-hidden />
                        {m.ltiActivate()}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="max-md:h-10"
                      onClick={() => open(tool)}
                    >
                      <Pencil aria-hidden />
                      {tool.state === "pending"
                        ? m.ltiReview()
                        : m.ltiEditTool()}
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
          <Copyable
            label={m.ltiConfigurationUrl()}
            value={data.platform.configurationUrl}
          />
        </div>
      </SettingsSection>
      {registering.key > 0 ? (
        <RegisterSheet
          key={registering.key}
          open={registering.open}
          onClose={() =>
            setRegistering((current) => ({ ...current, open: false }))
          }
          onOpened={setWaitingOn}
        />
      ) : null}
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
