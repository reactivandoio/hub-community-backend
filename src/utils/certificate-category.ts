/**
 * Certificate categories — "Participante" (the default), "Organizador", "Mentor"…
 *
 * A category is stored as the label the organizer typed on the certificate request
 * form, and copied verbatim onto every participant and certificate that came from
 * that form. Comparisons go through `categoryKey` so accents and casing never split
 * one list in two, and rows created before categories existed (`null`) count as the
 * default one.
 */

export const DEFAULT_CATEGORY = "Participante";

/** The label to store: what was typed, or the default when nothing was. */
export function normalizeCategory(value?: string | null): string {
  return (value || "").trim() || DEFAULT_CATEGORY;
}

/** Comparison key: accent- and case-insensitive, so "Mentoria" === "mentoria". */
export function categoryKey(value?: string | null): string {
  return normalizeCategory(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isDefaultCategory(value?: string | null): boolean {
  return categoryKey(value) === categoryKey(DEFAULT_CATEGORY);
}

/**
 * Strapi filter fragment matching one category. The default category also matches
 * the `null` left by every certificate issued before this field existed.
 */
export function categoryFilter(value?: string | null): Record<string, any> {
  const label = normalizeCategory(value);
  if (!isDefaultCategory(label)) return { category: { $eqi: label } };
  return { $or: [{ category: { $null: true } }, { category: { $eqi: label } }] };
}
