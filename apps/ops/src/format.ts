const KIB = 1024;
const units = ["bytes", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= KIB && unit < units.length - 1) {
    value /= KIB;
    unit += 1;
  }
  const shown = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${shown.toLocaleString("en")} ${units[unit]}`;
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const MODULE_NAMES: Record<string, string> = {
  elearning: "E-learning",
  early_years: "Early years",
  video: "Video",
  coding: "Coding and blocks",
};

export const BOARD_NAMES: Record<string, string> = {
  cambridge: "Cambridge International",
  pearson: "Pearson Edexcel",
  ib: "International Baccalaureate",
  jcq: "UK boards (JCQ: AQA, OCR, WJEC)",
};

export function formatMonth(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}
