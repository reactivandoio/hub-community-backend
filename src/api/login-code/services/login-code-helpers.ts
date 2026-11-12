/**
 * REA-26: login by a code sent to the e-mail. Pure logic, unit tested without booting Strapi;
 * every database access, random value and hash comes in through `deps`.
 *
 * - request: a 6-digit code valid for CODE_TTL_MS. Asking again invalidates the previous one.
 *   At most one code per RESEND_COOLDOWN_MS and MAX_CODES_PER_DAY a day per e-mail.
 * - verify: MAX_ATTEMPTS wrong tries burn the code. A right code logs into the account of the
 *   e-mail, or creates it (no password of its own, e-mail confirmed). Either way the e-mail is now
 *   verified, so `password_pending` (REA-22: "registration not finished") turns false.
 *
 * Blocked accounts (REA-36) never get a code nor a session.
 */

import { allocateUsername, normalizeEmail } from '../../account-setup/services/account-setup-helpers';

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_CODES_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD_BYTES = 32;

export type LoginCodeRow = {
  id: number;
  code_hash: string;
  expires_at: string | Date;
  attempts?: number | null;
};

export type LoginUser = { id: number; blocked?: boolean | null; confirmed?: boolean | null; password_pending?: boolean | null };

export type RequestDeps = {
  findUser: (email: string) => Promise<LoginUser | null>;
  /** createdAt of the codes of this e-mail created since `since`. */
  codesSince: (email: string, since: Date) => Promise<Array<string | Date>>;
  invalidateCodes: (email: string, now: Date) => Promise<any>;
  createCode: (data: { email: string; code_hash: string; expires_at: Date }) => Promise<any>;
  randomCode: () => string;
  hash: (email: string, code: string) => string;
};

export type RequestResult =
  | { status: 'sent'; code: string; expiresAt: string }
  | { status: 'cooldown'; retryAfter: number }
  | { status: 'limit' }
  | { status: 'blocked' };

export async function requestLoginCode(rawEmail: string, deps: RequestDeps, now = new Date()): Promise<RequestResult> {
  const email = normalizeEmail(rawEmail);

  const user = await deps.findUser(email);
  if (user?.blocked) return { status: 'blocked' };

  const recent = (await deps.codesSince(email, new Date(now.getTime() - DAY_MS))).map((d) => new Date(d).getTime());
  if (recent.length >= MAX_CODES_PER_DAY) return { status: 'limit' };
  const last = recent.length ? Math.max(...recent) : 0;
  const wait = last + RESEND_COOLDOWN_MS - now.getTime();
  if (wait > 0) return { status: 'cooldown', retryAfter: Math.ceil(wait / 1000) };

  await deps.invalidateCodes(email, now);
  const code = deps.randomCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await deps.createCode({ email, code_hash: deps.hash(email, code), expires_at: expiresAt });
  return { status: 'sent', code, expiresAt: expiresAt.toISOString() };
}

export type VerifyDeps = {
  /** The newest code of the e-mail not yet used nor invalidated. */
  findActiveCode: (email: string) => Promise<LoginCodeRow | null>;
  setAttempts: (id: number, attempts: number) => Promise<any>;
  consumeCode: (id: number, now: Date) => Promise<any>;
  hash: (email: string, code: string) => string;
  /** Constant-time comparison of two hashes. */
  sameHash: (a: string, b: string) => boolean;
  findUser: (email: string) => Promise<LoginUser | null>;
  usernameExists: (username: string) => Promise<boolean>;
  createUser: (data: Record<string, any>) => Promise<{ id: number }>;
  updateUser: (id: number, data: Record<string, any>) => Promise<any>;
  randomHex: (bytes: number) => string;
};

export type VerifyResult =
  | { status: 'ok'; userId: number; created: boolean }
  | { status: 'invalid'; attemptsLeft: number }
  | { status: 'expired' }
  | { status: 'blocked' };

const normalizeCode = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export async function verifyLoginCode(
  rawEmail: string,
  rawCode: unknown,
  deps: VerifyDeps,
  now = new Date(),
): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const code = normalizeCode(rawCode);

  const row = await deps.findActiveCode(email);
  if (!row) return { status: 'expired' };
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    await deps.consumeCode(row.id, now);
    return { status: 'expired' };
  }

  const ok = code.length === CODE_LENGTH && deps.sameHash(deps.hash(email, code), row.code_hash);
  if (!ok) {
    const attempts = (row.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await deps.consumeCode(row.id, now);
      return { status: 'invalid', attemptsLeft: 0 };
    }
    await deps.setAttempts(row.id, attempts);
    return { status: 'invalid', attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  await deps.consumeCode(row.id, now);

  const user = await deps.findUser(email);
  if (user?.blocked) return { status: 'blocked' };

  if (user) {
    if (user.confirmed !== true || user.password_pending === true) {
      await deps.updateUser(user.id, { confirmed: true, password_pending: false });
    }
    return { status: 'ok', userId: user.id, created: false };
  }

  const created = await deps.createUser({
    email,
    username: await allocateUsername(email, deps),
    // Never used to log in (there is no password login); the plugin requires one.
    password: deps.randomHex(PASSWORD_BYTES),
    provider: 'local',
    confirmed: true,
    password_pending: false,
  });
  return { status: 'ok', userId: created.id, created: true };
}
