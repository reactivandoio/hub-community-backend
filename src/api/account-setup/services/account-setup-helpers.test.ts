import { describe, it, expect, vi } from 'vitest';
import {
  InvalidEmailError,
  normalizeEmail,
  buildUsername,
  setupAccount,
  accountStatuses,
  ACCOUNT_STATUS_MAX_EMAILS,
} from './account-setup-helpers';

// randomHex returns a predictable value per byte count so assertions can check where each
// random value went (username suffix, password).
const createDeps = (overrides: Record<string, any> = {}) => ({
  findUserByEmail: vi.fn().mockResolvedValue(null),
  usernameExists: vi.fn().mockResolvedValue(false),
  createUser: vi.fn(async (data: any) => ({ id: 1, ...data })),
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
  it('creates a pending account without any password token', async () => {
    const deps = createDeps();

    const result = await setupAccount(
      { email: ' Ana@Example.com ', name: 'Ana', phone: '11999999999' },
      deps,
    );

    expect(result).toEqual({ created: true, pending: true });
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
    });
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

  it('reports an existing pending account without creating a user', async () => {
    const deps = createDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 7, password_pending: true }),
    });

    const result = await setupAccount({ email: 'ana@example.com', name: 'Ana' }, deps);

    expect(result).toEqual({ created: false, pending: true });
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('reports a finished account as not pending', async () => {
    const deps = createDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 7, password_pending: false }),
    });

    const result = await setupAccount({ email: 'ana@example.com' }, deps);

    expect(result).toEqual({ created: false, pending: false });
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('treats accounts from before the field existed (null) as finished', async () => {
    const deps = createDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 7, password_pending: null }),
    });

    const result = await setupAccount({ email: 'ana@example.com' }, deps);

    expect(result).toEqual({ created: false, pending: false });
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

describe('accountStatuses (REA-22)', () => {
  it('tells which accounts still have no password of their own', async () => {
    const find = vi.fn().mockResolvedValue([
      { email: 'Ana@Example.com', password_pending: true },
      { email: 'bia@example.com', password_pending: false },
      { email: 'caio@example.com', password_pending: null },
    ]);
    const result = await accountStatuses(['ana@example.com', 'bia@example.com', 'caio@example.com'], find);
    expect(result).toEqual([
      { email: 'ana@example.com', pending: true },
      { email: 'bia@example.com', pending: false },
      { email: 'caio@example.com', pending: false },
    ]);
  });

  it('normalizes, dedupes and drops invalid e-mails before asking', async () => {
    const find = vi.fn().mockResolvedValue([]);
    await accountStatuses([' Ana@Example.com ', 'ana@example.com', 'nope', 42, null], find);
    expect(find).toHaveBeenCalledWith(['ana@example.com']);
  });

  it('does not query without a valid e-mail and caps the list', async () => {
    const find = vi.fn().mockResolvedValue([]);
    expect(await accountStatuses(undefined, find)).toEqual([]);
    expect(await accountStatuses(['x'], find)).toEqual([]);
    expect(find).not.toHaveBeenCalled();
    const many = Array.from({ length: ACCOUNT_STATUS_MAX_EMAILS + 10 }, (_, i) => `u${i}@example.com`);
    await accountStatuses(many, find);
    expect(find.mock.calls[0][0]).toHaveLength(ACCOUNT_STATUS_MAX_EMAILS);
  });
});
