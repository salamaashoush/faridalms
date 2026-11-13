import type { PublicSchool } from "@faridalms/database/stores/public-school";

/** What the website builder shows of the school: its names, its ways to be reached and the colour its theme follows. */
export function siteSchool(school: PublicSchool | null) {
  return {
    nameEn: school?.nameEn ?? "",
    nameAr: school?.nameAr ?? null,
    contact: {
      address: school?.address ?? null,
      phone: school?.phone ?? null,
      email: school?.email ?? null,
    },
    brand: school?.brandColour ?? null,
  };
}
