import { describe, it, expect, vi } from 'vitest';
import {
  InvalidEmailError,
  normalizeEmail,
  buildUsername,
  setupAccount,
  wrapResetPassword,
} from './account-setup-helpers';

// randomHex returns a predictable value per byte count so assertions can check where each
// random value went (username suffix, password, reset token).
const createDeps = (overrides: Record<string, any> = {}) => ({
  findUserByEmail: vi.fn().mockResolvedValue(null),
  usernameExists: vi.fn().mockResolvedValue(false),
  createUser: vi.fn(async (data: any) => ({ id: 1, ...data })),
  updateUser: vi.fn().mockResolvedValue(undefined),
  randomHex: vi.fn((bytes: number) => `hex${bytes}`),
  ...overrides,
});

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com');
  });
  it('rejects malformed and empty values', () => {
    expect(() => normalizeEmail('ana')).toThrow(InvalidEmailError);
    expect(() => normalizeEmail('ana@example')).toThrow(InvalidEmailError);
    expect(() => normalizeEmail('')).toThrow(InvalidEmailError);
    expect(() => normalizeEmail(undefined as any)).toThrow(InvalidEmailError);
    expect(() => normalizeEmail(42 as any)).toThrow(InvalidEmailError);
  });
});

describe('buildUsername', () => {
  it('uses the local part of the e-mail plus the suffix', () => {
    expect(buildUsername('ana.silva@example.com', 'a1b2c3')).toBe('ana.silva-a1b2c3');
  });
  it('drops characters that do not belong in a username', () => {
    expect(buildUsername('ana+eventos@example.com', 'a1b2c3')).toBe('anaeventos-a1b2c3');
  });
  it('falls back to "user" when nothing is left of the local part', () => {
    expect(buildUsername('+++@example.com', 'a1b2c3')).toBe('user-a1b2c3');
  });
});

describe('setupAccount', () => {
  it('creates a pending account and returns its reset token', async () => {
    const deps = createDeps();

    const result = await setupAccount(
      { email: ' Ana@Example.com ', name: 'Ana', phone: '11999999999' },
      deps,
    );

    expect(result).toEqual({ created: true, token: 'hex64' });
    expect(deps.findUserByEmail).toHaveBeenCalledWith('ana@example.com');
    expect(deps.createUser).toHaveBeenCalledWith({
      email: 'ana@example.com',
      username: 'ana-hex3',
      password: 'hex32',
      provider: 'local',
      confirmed: true,
      name: 'Ana',
      phone: '11999999999',
      password_pending: true,
      resetPasswordToken: 'hex64',
    });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('retries the username suffix until it is free', async () => {
    let calls = 0;
    const deps = createDeps({
      usernameExists: vi.fn(async () => ++calls < 3),
      randomHex: vi.fn((bytes: number) => (bytes === 3 ? `s${calls}` : `hex${bytes}`)),
    });

    await setupAccount({ email: 'ana@example.com' }, deps);

    expect(deps.usernameExists).toHaveBeenCalledTimes(3);
    expect(deps.createUser.mock.calls[0][0].username).toBe('ana-s2');
  });

  it('leaves name and phone out when they are not sent', async () => {
    const deps = createDeps();

    await setupAccount({ email: 'ana@example.com' }, deps);

    const data = deps.createUser.mock.calls[0][0];
    expect(data).not.toHaveProperty('name');
    expect(data).not.toHaveProperty('phone');
  });

  it('gives an existing pending account a new token without creating a user', async () => {
    const deps = createDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 7, password_pending: true }),
    });

    const result = await setupAccount({ email: 'ana@example.com', name: 'Ana' }, deps);

    expect(result).toEqual({ created: false, token: 'hex64' });
    expect(deps.createUser).not.toHaveBeenCalled();
    expect(deps.updateUser).toHaveBeenCalledWith(7, { resetPasswordToken: 'hex64' });
  });

  it('does not touch an account that already has a password', async () => {
    const deps = createDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 7, password_pending: false }),
    });

    const result = await setupAccount({ email: 'ana@example.com' }, deps);

    expect(result).toEqual({ created: false, token: null });
    expect(deps.createUser).not.toHaveBeenCalled();
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('treats accounts from before the field existed (null) as having a password', async () => {
    const deps = createDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 7, password_pending: null }),
    });

    const result = await setupAccount({ email: 'ana@example.com' }, deps);

    expect(result).toEqual({ created: false, token: null });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid e-mail before touching the database', async () => {
    const deps = createDeps();

    await expect(setupAccount({ email: 'not-an-email' }, deps)).rejects.toBeInstanceOf(
      InvalidEmailError,
    );
    expect(deps.findUserByEmail).not.toHaveBeenCalled();
    expect(deps.createUser).not.toHaveBeenCalled();
  });
});

describe('wrapResetPassword', () => {
  const createCtx = (code?: string) => ({ request: { body: { code } } });

  it('clears password_pending of the user the code belonged to after a successful reset', async () => {
    const order: string[] = [];
    const original = vi.fn(async () => {
      order.push('original');
    });
    const deps = {
      findUserIdByResetCode: vi.fn(async () => {
        order.push('lookup');
        return 7;
      }),
      clearPasswordPending: vi.fn().mockResolvedValue(undefined),
    };

    await wrapResetPassword(original, deps)(createCtx('abc'));

    // The lookup has to happen first: the original clears resetPasswordToken.
    expect(order).toEqual(['lookup', 'original']);
    expect(deps.findUserIdByResetCode).toHaveBeenCalledWith('abc');
    expect(deps.clearPasswordPending).toHaveBeenCalledWith(7);
  });

  it('leaves the user alone when the reset fails', async () => {
    const error = new Error('Incorrect code provided');
    const deps = {
      findUserIdByResetCode: vi.fn().mockResolvedValue(7),
      clearPasswordPending: vi.fn(),
    };

    await expect(
      wrapResetPassword(vi.fn().mockRejectedValue(error), deps)(createCtx('abc')),
    ).rejects.toBe(error);
    expect(deps.clearPasswordPending).not.toHaveBeenCalled();
  });

  it('skips the lookup when no code is sent', async () => {
    const original = vi.fn().mockResolvedValue(undefined);
    const deps = { findUserIdByResetCode: vi.fn(), clearPasswordPending: vi.fn() };

    await wrapResetPassword(original, deps)(createCtx(undefined));

    expect(original).toHaveBeenCalled();
    expect(deps.findUserIdByResetCode).not.toHaveBeenCalled();
    expect(deps.clearPasswordPending).not.toHaveBeenCalled();
  });
});
