import { INVITE_DAYS } from "@faridalms/domain/first-sign-in";

/** Who was emailed a link to choose a password, and the name each signs in with. */
export function Sent({
  sent,
}: {
  sent: { schoolId: string | null; sentTo: string; loginName: string }[];
}) {
  return (
    <ul className="grid gap-1 text-sm">
      {sent.map((link) => (
        <li key={link.sentTo}>
          {link.sentTo} was emailed a link to choose a password
          {link.schoolId ? "" : " as the group's administrator"}. It works once,
          within {INVITE_DAYS} days, and they sign in as{" "}
          <span className="font-medium">{link.loginName}</span>.
        </li>
      ))}
    </ul>
  );
}
