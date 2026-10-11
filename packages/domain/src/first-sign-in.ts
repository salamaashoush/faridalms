import * as v from "valibot";

/**
 * A sign-in name that is not an email address: plain letters and digits a
 * student can read off a slip and type on any keyboard.
 */
export const SHORT_LOGIN_NAME = /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/;

const emailAddress = v.pipe(v.string(), v.maxLength(254), v.email());

/** What a person signs in with: their email address, or a short name. */
export const loginNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.union(
    [emailAddress, v.pipe(v.string(), v.regex(SHORT_LOGIN_NAME))],
    "validation.login_name",
  ),
);

export const SIGN_IN_WAYS = ["slips", "badges", "email"] as const;
export type SignInWay = (typeof SIGN_IN_WAYS)[number];

/** A link to choose a password works this long, a weekend with room to spare. */
export const INVITE_DAYS = 7;

/** An invite carries 256 random bits as base64url, as a badge does. */
export const INVITE_SECRET = /^[A-Za-z0-9_-]{43}$/;

const inviteSecret = v.pipe(v.string(), v.regex(INVITE_SECRET));

export const inviteSchema = v.object({ secret: inviteSecret });

export const MIN_PASSWORD = 15;

const newPassword = v.pipe(
  v.string(),
  v.minLength(MIN_PASSWORD),
  v.maxLength(256),
);

export const changePasswordSchema = v.object({
  current: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  password: newPassword,
});
export type ChangePasswordInput = v.InferInput<typeof changePasswordSchema>;

export const acceptInviteSchema = v.object({
  secret: inviteSecret,
  password: newPassword,
});

export const MAX_SIGN_INS = 100;

export const createSignInsSchema = v.object({
  studentIds: v.pipe(
    v.array(v.pipe(v.string(), v.uuid())),
    v.minLength(1),
    v.maxLength(MAX_SIGN_INS),
  ),
  way: v.picklist(SIGN_IN_WAYS),
});
export type CreateSignInsInput = v.InferInput<typeof createSignInsSchema>;

/** Why a student picked for a sign-in was left without one. */
export const SIGN_IN_REFUSALS = [
  "no_name",
  "disabled",
  "not_young",
  "no_email",
  "not_sent",
] as const;
export type SignInRefusal = (typeof SIGN_IN_REFUSALS)[number];

const plain = (text: string) =>
  text
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "");

/**
 * The names a student could sign in with, best first: their own email
 * address, then the number the school knows them by, which is already on
 * their card and their reports, then their name in Latin letters. A student
 * the school has named only in Arabic and given no number has none.
 */
export function loginNameChoices(student: {
  email: string | null;
  reference: string | null;
  givenNameEn: string | null;
  familyNameEn: string | null;
}): string[] {
  const email = student.email?.trim().toLowerCase() ?? "";
  const given = plain(student.givenNameEn ?? "");
  const family = plain(student.familyNameEn ?? "");
  const short = [
    plain(student.reference ?? ""),
    given && family ? `${given}.${family}` : given || family,
  ]
    .map((name) => name.slice(0, 60).replace(/\.$/, ""))
    .filter((name) => SHORT_LOGIN_NAME.test(name));
  return v.is(emailAddress, email) ? [email, ...short] : short;
}

/**
 * The first of a student's choices nobody holds. When all are held, the last
 * short one takes the lowest number that frees it, as two students of one
 * name need.
 */
export function freeLoginName(
  choices: readonly string[],
  taken: ReadonlySet<string>,
): string | null {
  const free = choices.find((name) => !taken.has(name));
  if (free) return free;
  const last = choices.findLast((name) => !name.includes("@"));
  if (!last) return null;
  for (let number = 2; number < 1000; number += 1)
    if (!taken.has(`${last}${number}`)) return `${last}${number}`;
  return null;
}

const CONSONANTS = "bdfghjkmnprstvz";
const VOWELS = "aeiou";

// Chunks that read as a rude word or a slur in English, Arabic or Spanish;
// a slip a child carries home should not have one on it.
const AVOIDED = new Set([
  "dago",
  "fuka",
  "fuku",
  "homo",
  "kaka",
  "kosi",
  "kusi",
  "mofo",
  "nazi",
  "niga",
  "nigu",
  "nude",
  "paki",
  "pedo",
  "pipi",
  "popo",
  "puta",
  "rape",
  "tizi",
  "zebi",
  "zibi",
  "zobi",
  "zubi",
]);

/**
 * A first password to print on a slip: four spoken-looking chunks a child
 * can copy without mixing up letters, with no capitals, digits or symbols to
 * get wrong. `pick` gives a whole number below its bound, each as likely as
 * the next.
 */
export function firstPassword(pick: (bound: number) => number): string {
  const chunk = (): string => {
    const made = Array.from(
      { length: 2 },
      () =>
        `${CONSONANTS[pick(CONSONANTS.length)]}${VOWELS[pick(VOWELS.length)]}`,
    ).join("");
    return AVOIDED.has(made) ? chunk() : made;
  };
  return Array.from({ length: 4 }, chunk).join("-");
}
