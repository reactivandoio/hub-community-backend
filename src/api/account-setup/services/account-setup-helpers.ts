/**
 * Pure helpers for account-setup — kept separate so they can be unit tested without booting
 * Strapi. Every database access and random value comes in through `deps`.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_USERNAME_ATTEMPTS = 5;

// Byte counts handed to randomHex (hex doubles them): 6-char username suffix, 64-char
// password (under bcrypt's 72-byte limit), 128-char reset token.
const USERNAME_SUFFIX_BYTES = 3;
const PASSWORD_BYTES = 32;
const RESET_TOKEN_BYTES = 64;

export class InvalidEmailError extends Error {
  constructor() {
    super('E-mail inválido');
    this.name = 'InvalidEmailError';
  }
}

export type SetupAccountInput = { email: string; name?: string; phone?: string };
export type SetupAccountResult = { created: boolean; token: string | null };

export type SetupAccountDeps = {
  findUserByEmail: (email: string) => Promise<{ id: number; password_pending?: boolean | null } | null>;
  usernameExists: (username: string) => Promise<boolean>;
  createUser: (data: Record<string, any>) => Promise<any>;
  updateUser: (id: number, data: Record<string, any>) => Promise<any>;
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

async function allocateUsername(email: string, deps: SetupAccountDeps): Promise<string> {
  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt++) {
    const username = buildUsername(email, deps.randomHex(USERNAME_SUFFIX_BYTES));
    if (!(await deps.usernameExists(username))) {
      return username;
    }
  }
  throw new Error('Não foi possível gerar um username único');
}

/**
 * Makes sure there is an account for the e-mail. A new account gets a random password and
 * `password_pending: true`; any pending account (new or old) gets a fresh reset token, which
 * invalidates the previous link. Accounts that already have a password are left untouched.
 */
export async function setupAccount(
  { email: rawEmail, name, phone }: SetupAccountInput,
  deps: SetupAccountDeps,
): Promise<SetupAccountResult> {
  const email = normalizeEmail(rawEmail);
  const existing = await deps.findUserByEmail(email);

  if (!existing) {
    const token = deps.randomHex(RESET_TOKEN_BYTES);
    await deps.createUser({
      email,
      username: await allocateUsername(email, deps),
      password: deps.randomHex(PASSWORD_BYTES),
      provider: 'local',
      confirmed: true,
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      password_pending: true,
      resetPasswordToken: token,
    });
    return { created: true, token };
  }

  if (existing.password_pending !== true) {
    return { created: false, token: null };
  }

  const token = deps.randomHex(RESET_TOKEN_BYTES);
  await deps.updateUser(existing.id, { resetPasswordToken: token });
  return { created: false, token };
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
