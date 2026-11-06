import { PaperSheet } from "~/components/system/PaperSheet";
import * as m from "~/i18n/messages";

export interface PrintedSlip {
  studentId: string;
  name: string;
  /** The student's class, so a teacher can hand a pile out by room. */
  className: string | null;
  loginName: string;
  password: string;
}

interface LineProps {
  label: string;
  value: string;
}

function Line({ label, value }: LineProps) {
  return (
    <div className="grid grid-cols-[26mm_1fr] items-baseline gap-[2mm]">
      <dt className="text-[8pt] leading-tight text-neutral-600">{label}</dt>
      <dd className="font-mono text-[11pt] leading-tight font-semibold break-all">
        <bdi dir="ltr">{value}</bdi>
      </dd>
    </div>
  );
}

export interface SignInSlipsProps {
  slips: PrintedSlip[];
  schoolName: string;
  notes?: readonly string[];
  warnings?: readonly string[];
  onDone: () => void;
}

/**
 * New sign-ins on paper, ten slips to an A4 page with the margins either
 * common browser prints by default, cut apart and handed out.
 * Closing the sheet drops the passwords, which the API never shows twice.
 */
export function SignInSlips({
  slips,
  schoolName,
  notes,
  warnings,
  onDone,
}: SignInSlipsProps) {
  const address = window.location.host;
  return (
    <PaperSheet
      title={m.slipsTitle()}
      hint={m.slipsReady()}
      notes={notes}
      warnings={warnings}
      onDone={onDone}
    >
      <ul className="grid grid-cols-[repeat(2,88mm)] gap-[3mm]">
        {slips.map((slip) => (
          <li
            key={slip.studentId}
            className="grid h-[50mm] w-[88mm] break-inside-avoid content-between rounded-[3mm] border border-dashed border-neutral-400 bg-white p-[4mm] text-neutral-950"
          >
            <div className="grid gap-[0.5mm]">
              <p
                dir="auto"
                className="truncate text-[12pt] leading-tight font-bold"
              >
                {slip.name}
              </p>
              <p
                dir="auto"
                className="truncate text-[8pt] leading-tight text-neutral-600"
              >
                {[slip.className, schoolName]
                  .filter((part) => part !== null)
                  .join(" · ")}
              </p>
            </div>
            <dl className="grid gap-[1.5mm]">
              <Line label={m.slipsWhere()} value={address} />
              <Line label={m.accountLoginName()} value={slip.loginName} />
              <Line label={m.authSignInFormPassword()} value={slip.password} />
            </dl>
            <p className="text-[7pt] leading-tight text-neutral-600">
              {m.slipsKeep()}
            </p>
          </li>
        ))}
      </ul>
    </PaperSheet>
  );
}
