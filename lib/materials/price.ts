// Money is stored as integer cents (BRL). Conversions here never go through floating point.
const MAX_CENTS = 2147483647;

/** 490 -> "R$ 4,90"; 123456 -> "R$ 1.234,56" (same format as the current catalog). */
export function formatPriceCents(cents: number) {
  const reais = Math.trunc(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${reais},${String(cents % 100).padStart(2, "0")}`;
}

/** Value shown in the form input: 490 -> "4,90". */
export function centsToInput(cents: number) {
  return formatPriceCents(cents).slice(3);
}

/**
 * Accepts "4,90", "4.90", "4", "1.234,56", "R$ 1.234,56". Returns integer cents or null when invalid.
 * Rejects negatives, more than two decimal places and any other character.
 */
export function parsePriceToCents(raw: string): number | null {
  const value = raw.trim().replace(/^R\$\s*/, "");
  let integer: string, fraction = "";
  const comma = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(value);
  const dot = /^(\d+)\.(\d{1,2})$/.exec(value);
  if (dot && !comma) { integer = dot[1]; fraction = dot[2]; }
  else if (comma) { integer = comma[1].replace(/\./g, ""); fraction = comma[2] ?? ""; }
  else return null;
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}
