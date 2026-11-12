/**
 * Pure helpers for account-setup — kept separate so they can be unit tested without booting
 * Strapi. Every database access and random value comes in through `deps`.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_USERNAME_ATTEMPTS = 5;

// Byte counts handed to randomHex (hex doubles them): 6-char username suffix and a 64-char
// password (under bcrypt's 72-byte limit) nobody uses — there is no password login (REA-26).
const USERNAME_SUFFIX_BYTES = 3;
const PASSWORD_BYTES = 32;

export class InvalidEmailError extends Error {
  constructor() {
    super('E-mail inválido');
    this.name = 'InvalidEmailError';
  }
}

export type SetupAccountInput = { email: string; name?: string; phone?: string };
// `pending`: the account still has no verified e-mail (REA-22/REA-26: it never logged in with a
// code), so the bff sends the "conclua seu cadastro" e-mail.
export type SetupAccountResult = { created: boolean; pending: boolean };

export type SetupAccountDeps = {
  findUserByEmail: (email: string) => Promise<{ id: number; password_pending?: boolean | null } | null>;
  usernameExists: (username: string) => Promise<boolean>;
  createUser: (data: Record<string, any>) => Promise<any>;
  randomHex: (bytes: number) => string;
};

export function normalizeEmail(value: string): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new InvalidEmailError();
  }
  return email;
}

export function buildUsername(email: string, suffix: string): string {
  const local = email.split('@')[0].replace(/[^a-z0-9._-]/g, '') || 'user';
  return `${local}-${suffix}`;
}

export async function allocateUsername(
  email: string,
  deps: { usernameExists: (username: string) => Promise<boolean>; randomHex: (bytes: number) => string },
): Promise<string> {
  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt++) {
    const username = buildUsername(email, deps.randomHex(USERNAME_SUFFIX_BYTES));
    if (!(await deps.usernameExists(username))) {
      return username;
    }
  }
  throw new Error('Não foi possível gerar um username único');
}

/**
 * Makes sure there is an account for the e-mail. A new account gets a random password (never used:
 * the login is by a code sent to the e-mail, REA-26), `confirmed: true` and `password_pending: true`
 * — "registration not finished" until the person logs in with a code. Existing accounts are left
 * untouched.
 */
export async function setupAccount(
  { email: rawEmail, name, phone }: SetupAccountInput,
  deps: SetupAccountDeps,
): Promise<SetupAccountResult> {
  const email = normalizeEmail(rawEmail);
  const existing = await deps.findUserByEmail(email);

  if (!existing) {
    await deps.createUser({
      email,
      username: await allocateUsername(email, deps),
      password: deps.randomHex(PASSWORD_BYTES),
      provider: 'local',
      confirmed: true,
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      password_pending: true,
    });
    return { created: true, pending: true };
  }

  return { created: false, pending: existing.password_pending === true };
}

export type ResetPasswordDeps = {
  findUserIdByResetCode: (code: string) => Promise<number | null>;
  clearPasswordPending: (id: number) => Promise<any>;
};

/**
 * Wraps users-permissions `auth.resetPassword` so a successful reset clears `password_pending`.
 * The user is looked up by the code *before* the original runs, since it clears the token.
 */
export function wrapResetPassword(
  original: (ctx: any) => Promise<any>,
  deps: ResetPasswordDeps,
) {
  return async (ctx: any) => {
    const code = ctx.request?.body?.code;
    const userId = typeof code === 'string' && code ? await deps.findUserIdByResetCode(code) : null;

    const result = await original(ctx);

    if (userId) {
      await deps.clearPasswordPending(userId);
    }
    return result;
  };
}

// REA-22: at most this many e-mails per account-status call (the bff asks for one or a page).
export const ACCOUNT_STATUS_MAX_EMAILS = 100;

export type AccountStatus = { email: string; pending: boolean };

/**
 * Whether each e-mail's account still has no verified e-mail (`password_pending`, which stays
 * private on the user). E-mails without an account are left out; invalid ones are ignored.
 * "Cadastro concluído" = the person logged in with a code sent to the e-mail (REA-26) — or, before
 * it, created a password.
 */
export async function accountStatuses(
  rawEmails: unknown,
  findUsersByEmails: (emails: string[]) => Promise<Array<{ email: string; password_pending?: boolean | null }>>,
): Promise<AccountStatus[]> {
  const list = Array.isArray(rawEmails) ? rawEmails : [];
  const emails = [
    ...new Set(
      list
        .map((value) => {
          try {
            return normalizeEmail(value as string);
          } catch {
            return null;
          }
        })
        .filter((email): email is string => Boolean(email)),
    ),
  ].slice(0, ACCOUNT_STATUS_MAX_EMAILS);
  if (emails.length === 0) return [];

  const users = await findUsersByEmails(emails);
  return users.map((user) => ({
    email: String(user.email || '').trim().toLowerCase(),
    pending: user.password_pending === true,
  }));
}
