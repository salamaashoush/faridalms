import { Avatar, AvatarFallback, AvatarImage } from "@faridalms/ui/avatar";

import { initialsOf } from "~/components/app/UserMenu";

/**
 * The name is always rendered next to this, so the image is decorative and the
 * alt text stays empty rather than repeating it to a screen reader.
 */
export function PersonAvatar({
  name,
  photoUrl,
  size = "default",
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "default" | "lg";
}) {
  return (
    <Avatar size={size} aria-hidden>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
      <AvatarFallback className="font-semibold">
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
