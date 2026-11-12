/**
 * Minimum age of the Hub (REA-36): every account and every signup is for people aged 18 or more.
 *
 * Dates of birth are calendar dates (YYYY-MM-DD) and "today" is the calendar date in São Paulo, so
 * someone born on 2008-11-12 turns 18 on 2026-11-12 no matter the server's time zone.
 */

export const MIN_AGE = 18;
const OLDEST_AGE = 120;
const TIME_ZONE = 'America/Sao_Paulo';

type Ymd = { y: number; m: number; d: number };

const parseYmd = (value: unknown): Ymd | null => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { y: value.getUTCFullYear(), m: value.getUTCMonth() + 1, d: value.getUTCDate() };
  }
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
};

/** Today's calendar date in São Paulo. */
export const todayYmd = (now: Date = new Date()): Ymd => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
};

/** Age in whole years on `now`, or null when the date is not a valid YYYY-MM-DD. */
export const ageOn = (dateOfBirth: unknown, now: Date = new Date()): number | null => {
  const birth = parseYmd(dateOfBirth);
  if (!birth) return null;
  const today = todayYmd(now);
  let age = today.y - birth.y;
  if (today.m < birth.m || (today.m === birth.m && today.d < birth.d)) age -= 1;
  return age;
};

/** Why a date of birth is refused, or null when it is fine (18 or more, not in the future). */
export const dateOfBirthRefusal = (dateOfBirth: unknown, now: Date = new Date()): string | null => {
  const age = ageOn(dateOfBirth, now);
  if (age === null) return 'Informe uma data de nascimento válida.';
  if (age < 0 || age > OLDEST_AGE) return 'Informe uma data de nascimento válida.';
  if (age < MIN_AGE) return `É preciso ter ${MIN_AGE} anos ou mais.`;
  return null;
};

export const isMinor = (dateOfBirth: unknown, now: Date = new Date()): boolean => {
  const age = ageOn(dateOfBirth, now);
  return age !== null && age < MIN_AGE;
};
