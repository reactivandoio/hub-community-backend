/**
 * Slug generation, shared by the entities that own a slug (Event, Community).
 *
 * It used to be copy-pasted in both services, which is also why the tests grew
 * their own third copy and stopped saying anything about the real behaviour.
 */

import slugify from "slugify";

export const MAX_SLUG_LENGTH = 100;

// slugify's charmap runs before `strict` drops anything, so "™" becomes "tm",
// "®" becomes "r" and "&" becomes "and" — "Tecnologia™ & Inovação®" came out as
// "tecnologiatm-and-inovacaor". Decorative marks are dropped and "&" becomes a
// word break, so the slug reads like the title.
const DECORATIVE_MARKS = /[™®©]/g;

/** The slug for a title, before uniqueness is taken into account. */
export function slugFromTitle(title: string): string {
  if (!title || typeof title !== "string") {
    throw new Error("Title is required to generate slug");
  }

  const readable = title.replace(DECORATIVE_MARKS, "").replace(/&/g, " ");
  const slug = slugify(readable, { lower: true, strict: true, trim: true });

  if (slug.length <= MAX_SLUG_LENGTH) return slug;

  // Hard cut at the column's limit, dropping a hyphen the cut left dangling.
  return slug.substring(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
}

/**
 * The slug for a title that nothing else in `uid` is using yet, adding `-2`,
 * `-3`… until it is free. `excludeDocumentId` is the entity being updated, so a
 * title that did not change does not collide with itself.
 */
export async function generateUniqueSlug(
  strapi: any,
  uid: string,
  title: string,
  excludeDocumentId?: string,
): Promise<string> {
  const baseSlug = slugFromTitle(title);

  let slug = baseSlug;
  let counter = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const filters: any = { slug: { $eq: slug } };

    if (excludeDocumentId) {
      filters.documentId = { $ne: excludeDocumentId };
    }

    const existing = await strapi.entityService.findMany(uid, {
      filters,
      limit: 1,
    });

    if (!existing || existing.length === 0) break;

    const suffix = `-${counter}`;
    const maxBaseLength = MAX_SLUG_LENGTH - suffix.length;
    slug = `${baseSlug.substring(0, maxBaseLength)}${suffix}`;
    counter += 1;
  }

  return slug;
}
