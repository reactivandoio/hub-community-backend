/**
 * Age rules of the user (REA-36).
 *
 * - `adult_declaration` is the "Declaro que tenho 18 anos ou mais" checkbox. Whenever it is written,
 *   `adult_declaration_at` becomes now (declared) or null (taken back), like the marketing opt-in.
 * - `date_of_birth`, when given, must be a valid date of someone aged 18 or more.
 * - Age review (the admin menu in /admin/usuarios): `age_review_status` is
 *     dob_requested  the e-mail asking for the date of birth was sent at `age_review_requested_at`;
 *                    if no date arrives in 7 days the account is blocked (`blockDueAgeReviews`);
 *     dob_blocked    blocked because the date never came;
 *     minor_blocked  blocked by the admin because the date of birth is under 18.
 *   A valid date of birth sent while `dob_requested` ends the review (status and date cleared), so
 *   the account is never blocked after the person answers.
 */

import { dateOfBirthRefusal } from './age';

export const AGE_REVIEW_STATUSES = ['dob_requested', 'dob_blocked', 'minor_blocked'] as const;
export type AgeReviewStatus = (typeof AGE_REVIEW_STATUSES)[number];

export const DOB_REQUEST_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export class DateOfBirthError extends Error {}

export const stampAdultDeclaration = <T extends Record<string, unknown>>(data: T, now: Date = new Date()): T => {
  if (!data || typeof data.adult_declaration !== 'boolean') return data;
  return { ...data, adult_declaration_at: data.adult_declaration ? now : null };
};

const hasDate = (value: unknown) => value !== undefined && value !== null && value !== '';

const sameDate = (a: unknown, b: unknown) => {
  const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? '')).slice(0, 10);
  return hasDate(a) && hasDate(b) && day(a) === day(b);
};

type CurrentUser = { date_of_birth?: unknown; age_review_status?: string | null } | null;

/**
 * Applies the date-of-birth rules to the data of a create (current = null) or an update.
 * Throws DateOfBirthError when the date is refused. A date equal to the stored one is not checked
 * again, so an old record can still be edited (e.g. blocked) without touching its date.
 */
export const applyDateOfBirthRules = <T extends Record<string, unknown>>(
  data: T,
  current: CurrentUser,
  now: Date = new Date(),
): T => {
  if (!data || !hasDate(data.date_of_birth)) return data;
  if (current && sameDate(data.date_of_birth, current.date_of_birth)) return data;

  const refusal = dateOfBirthRefusal(data.date_of_birth, now);
  if (refusal) throw new DateOfBirthError(refusal);

  if (current?.age_review_status === 'dob_requested' && !('age_review_status' in data)) {
    return { ...data, age_review_status: null, age_review_requested_at: null };
  }
  return data;
};

/** The moment before which a `dob_requested` e-mail is past its 7 days. */
export const dobRequestCutoff = (now: Date = new Date()) => new Date(now.getTime() - DOB_REQUEST_DAYS * DAY_MS);

/** Deadline of a request sent at `requestedAt`. */
export const dobRequestDeadline = (requestedAt: Date | string) =>
  new Date(new Date(requestedAt).getTime() + DOB_REQUEST_DAYS * DAY_MS);

type Db = {
  findDue: (cutoff: Date) => Promise<{ id: number | string }[]>;
  block: (id: number | string, data: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Blocks the accounts whose date-of-birth request is older than 7 days and still unanswered.
 * Only accounts the admin e-mailed from the menu are ever `dob_requested`, so nothing is blocked
 * by a deploy on its own. Returns how many were blocked.
 */
export const blockDueAgeReviews = async (db: Db, now: Date = new Date()) => {
  const due = await db.findDue(dobRequestCutoff(now));
  for (const user of due) {
    await db.block(user.id, { blocked: true, age_review_status: 'dob_blocked', age_review_blocked_at: now });
  }
  return due.length;
};
