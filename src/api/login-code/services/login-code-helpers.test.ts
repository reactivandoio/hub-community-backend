import { describe, it, expect, vi } from 'vitest';

import { InvalidEmailError } from '../../account-setup/services/account-setup-helpers';
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_CODES_PER_DAY,
  RESEND_COOLDOWN_MS,
  requestLoginCode,
  verifyLoginCode,
} from './login-code-helpers';

const NOW = new Date('2026-11-12T15:00:00.000Z');
const hash = (email: string, code: string) => `h(${email}:${code})`;

const requestDeps = (overrides: Record<string, any> = {}) => ({
  findUser: vi.fn().mockResolvedValue(null),
  codesSince: vi.fn().mockResolvedValue([]),
  invalidateCodes: vi.fn().mockResolvedValue(undefined),
  createCode: vi.fn().mockResolvedValue(undefined),
  randomCode: vi.fn(() => '012345'),
  hash,
  ...overrides,
});

describe('requestLoginCode', () => {
  it('creates a code (hash only), invalidating the previous ones', async () => {
    const deps = requestDeps();

    const result = await requestLoginCode(' Ana@Example.com ', deps, NOW);

    expect(result).toEqual({
      status: 'sent',
      code: '012345',
      expiresAt: new Date(NOW.getTime() + CODE_TTL_MS).toISOString(),
    });
    expect(deps.invalidateCodes).toHaveBeenCalledWith('ana@example.com', NOW);
    expect(deps.createCode).toHaveBeenCalledWith({
      email: 'ana@example.com',
      code_hash: 'h(ana@example.com:012345)',
      expires_at: new Date(NOW.getTime() + CODE_TTL_MS),
    });
  });

  it('works for an e-mail without an account (signup)', async () => {
    const result = await requestLoginCode('nova@example.com', requestDeps(), NOW);
    expect(result.status).toBe('sent');
  });

  it('asks to wait while the last code is younger than the cooldown', async () => {
    const deps = requestDeps({
      codesSince: vi.fn().mockResolvedValue([new Date(NOW.getTime() - 20 * 1000)]),
    });

    const result = await requestLoginCode('ana@example.com', deps, NOW);

    expect(result).toEqual({ status: 'cooldown', retryAfter: (RESEND_COOLDOWN_MS - 20 * 1000) / 1000 });
    expect(deps.createCode).not.toHaveBeenCalled();
  });

  it('allows a new code once the cooldown is over', async () => {
    const deps = requestDeps({
      codesSince: vi.fn().mockResolvedValue([new Date(NOW.getTime() - RESEND_COOLDOWN_MS).toISOString()]),
    });
    expect((await requestLoginCode('ana@example.com', deps, NOW)).status).toBe('sent');
  });

  it('stops at the daily limit per e-mail', async () => {
    const old = new Date(NOW.getTime() - 60 * 60 * 1000);
    const deps = requestDeps({
      codesSince: vi.fn().mockResolvedValue(Array(MAX_CODES_PER_DAY).fill(old)),
    });

    expect(await requestLoginCode('ana@example.com', deps, NOW)).toEqual({ status: 'limit' });
    expect(deps.codesSince).toHaveBeenCalledWith('ana@example.com', new Date(NOW.getTime() - 24 * 60 * 60 * 1000));
    expect(deps.createCode).not.toHaveBeenCalled();
  });

  it('never sends a code to a blocked account', async () => {
    const deps = requestDeps({ findUser: vi.fn().mockResolvedValue({ id: 3, blocked: true }) });

    expect(await requestLoginCode('ana@example.com', deps, NOW)).toEqual({ status: 'blocked' });
    expect(deps.createCode).not.toHaveBeenCalled();
  });

  it('rejects an invalid e-mail before touching the database', async () => {
    const deps = requestDeps();
    await expect(requestLoginCode('ana', deps, NOW)).rejects.toBeInstanceOf(InvalidEmailError);
    expect(deps.findUser).not.toHaveBeenCalled();
  });
});

const activeCode = (overrides: Record<string, any> = {}) => ({
  id: 9,
  code_hash: 'h(ana@example.com:012345)',
  expires_at: new Date(NOW.getTime() + 60 * 1000).toISOString(),
  attempts: 0,
  ...overrides,
});

const verifyDeps = (overrides: Record<string, any> = {}) => ({
  findActiveCode: vi.fn().mockResolvedValue(activeCode()),
  setAttempts: vi.fn().mockResolvedValue(undefined),
  consumeCode: vi.fn().mockResolvedValue(undefined),
  hash,
  sameHash: (a: string, b: string) => a === b,
  findUser: vi.fn().mockResolvedValue(null),
  usernameExists: vi.fn().mockResolvedValue(false),
  createUser: vi.fn(async () => ({ id: 42 })),
  updateUser: vi.fn().mockResolvedValue(undefined),
  randomHex: vi.fn((bytes: number) => `hex${bytes}`),
  ...overrides,
});

describe('verifyLoginCode', () => {
  it('logs into the existing account and marks the e-mail as verified', async () => {
    const deps = verifyDeps({
      findUser: vi.fn().mockResolvedValue({ id: 7, confirmed: true, password_pending: true }),
    });

    const result = await verifyLoginCode('Ana@example.com', '012345', deps, NOW);

    expect(result).toEqual({ status: 'ok', userId: 7, created: false });
    expect(deps.consumeCode).toHaveBeenCalledWith(9, NOW);
    expect(deps.updateUser).toHaveBeenCalledWith(7, { confirmed: true, password_pending: false });
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('confirms an account that never confirmed its e-mail', async () => {
    const deps = verifyDeps({ findUser: vi.fn().mockResolvedValue({ id: 7, confirmed: false, password_pending: null }) });
    await verifyLoginCode('ana@example.com', '012345', deps, NOW);
    expect(deps.updateUser).toHaveBeenCalledWith(7, { confirmed: true, password_pending: false });
  });

  it('does not write to a finished account', async () => {
    const deps = verifyDeps({ findUser: vi.fn().mockResolvedValue({ id: 7, confirmed: true, password_pending: false }) });
    await verifyLoginCode('ana@example.com', '012345', deps, NOW);
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('accepts the code typed with spaces or dashes', async () => {
    const deps = verifyDeps({ findUser: vi.fn().mockResolvedValue({ id: 7, confirmed: true }) });
    expect((await verifyLoginCode('ana@example.com', ' 012-345 ', deps, NOW)).status).toBe('ok');
  });

  it('creates the account of a new e-mail when the code is right', async () => {
    const deps = verifyDeps();

    const result = await verifyLoginCode('ana@example.com', '012345', deps, NOW);

    expect(result).toEqual({ status: 'ok', userId: 42, created: true });
    expect(deps.createUser).toHaveBeenCalledWith({
      email: 'ana@example.com',
      username: 'ana-hex3',
      password: 'hex32',
      provider: 'local',
      confirmed: true,
      password_pending: false,
    });
  });

  it('counts a wrong code and tells how many tries are left', async () => {
    const deps = verifyDeps({ findActiveCode: vi.fn().mockResolvedValue(activeCode({ attempts: 1 })) });

    const result = await verifyLoginCode('ana@example.com', '999999', deps, NOW);

    expect(result).toEqual({ status: 'invalid', attemptsLeft: MAX_ATTEMPTS - 2 });
    expect(deps.setAttempts).toHaveBeenCalledWith(9, 2);
    expect(deps.consumeCode).not.toHaveBeenCalled();
    expect(deps.findUser).not.toHaveBeenCalled();
  });

  it('burns the code on the last wrong try', async () => {
    const deps = verifyDeps({
      findActiveCode: vi.fn().mockResolvedValue(activeCode({ attempts: MAX_ATTEMPTS - 1 })),
    });

    expect(await verifyLoginCode('ana@example.com', '999999', deps, NOW)).toEqual({ status: 'invalid', attemptsLeft: 0 });
    expect(deps.consumeCode).toHaveBeenCalledWith(9, NOW);
  });

  it('treats a code of the wrong length as wrong', async () => {
    const deps = verifyDeps();
    expect((await verifyLoginCode('ana@example.com', '12345', deps, NOW)).status).toBe('invalid');
  });

  it('refuses an expired code and burns it', async () => {
    const deps = verifyDeps({
      findActiveCode: vi.fn().mockResolvedValue(activeCode({ expires_at: new Date(NOW.getTime() - 1).toISOString() })),
    });

    expect(await verifyLoginCode('ana@example.com', '012345', deps, NOW)).toEqual({ status: 'expired' });
    expect(deps.consumeCode).toHaveBeenCalledWith(9, NOW);
    expect(deps.findUser).not.toHaveBeenCalled();
  });

  it('answers expired when there is no active code', async () => {
    const deps = verifyDeps({ findActiveCode: vi.fn().mockResolvedValue(null) });
    expect(await verifyLoginCode('ana@example.com', '012345', deps, NOW)).toEqual({ status: 'expired' });
  });

  it('never opens a session for a blocked account', async () => {
    const deps = verifyDeps({ findUser: vi.fn().mockResolvedValue({ id: 7, blocked: true }) });

    expect(await verifyLoginCode('ana@example.com', '012345', deps, NOW)).toEqual({ status: 'blocked' });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });
});
