/**
 * A mobile number is kept as the office typed it, so the same number can be
 * stored as "0100 000 0003" and searched for as "+20 100 000 0003". Both are
 * compared on the national number: what is left once the international
 * prefix, the country calling code and the trunk zero are gone.
 *
 * Calling codes are prefix-free (ITU-T E.164), so the leading digits alone say
 * how long the code is: 1 and 7 take one digit, the codes below two, and every
 * other code three. The patterns are strings so that SQL can use them too.
 */
export const INTERNATIONAL_PATTERN = "^[^0-9]*\\+";
export const ONE_DIGIT_CODE_PATTERN = "^[17]";
export const TWO_DIGIT_CODE_PATTERN =
  "^(2[07]|3[0-469]|4[013-9]|5[1-8]|6[0-6]|8[1246]|9[0-58])";

const international = new RegExp(INTERNATIONAL_PATTERN);
const oneDigitCode = new RegExp(ONE_DIGIT_CODE_PATTERN);
const twoDigitCode = new RegExp(TWO_DIGIT_CODE_PATTERN);

export function nationalNumber(text: string) {
  const digits = text.replace(/\D/g, "");
  if (!international.test(text) && !digits.startsWith("00"))
    return digits.replace(/^0+/, "");
  const withCode = digits.replace(/^0+/, "");
  const code = oneDigitCode.test(withCode)
    ? 1
    : twoDigitCode.test(withCode)
      ? 2
      : 3;
  return withCode.slice(code).replace(/^0+/, "");
}
