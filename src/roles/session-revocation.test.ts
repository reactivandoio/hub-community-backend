import { describe, expect, it, vi } from 'vitest';

import { guardRevokedSessions, isRevokedToken } from './session-revocation';

// REA-63: when the admin changes a user's e-mail, every session opened before it ends. Whoever owns
// the wrong address may have logged in with a code sent there.

const revokedAt = '2026-11-16T12:00:00.000Z';
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('isRevokedToken', () => {
  it('refuses a token issued before the revocation', () => {
    expect(isRevokedToken({ id: 1, iat: at('2026-11-16T11:59:59.000Z') }, revokedAt)).toBe(true);
  });

  it('accepts a token issued at or after it (iat has whole seconds)', () => {
    expect(isRevokedToken({ id: 1, iat: at('2026-11-16T12:00:00.000Z') }, revokedAt)).toBe(false);
    expect(isRevokedToken({ id: 1, iat: at('2026-11-16T12:00:00.900Z') }, '2026-11-16T12:00:00.400Z')).toBe(false);
    expect(isRevokedToken({ id: 1, iat: at('2026-11-17T08:00:00.000Z') }, revokedAt)).toBe(false);
  });

  it('accepts every token of a user never revoked', () => {
    expect(isRevokedToken({ id: 1, iat: 1 }, null)).toBe(false);
    expect(isRevokedToken({ id: 1, iat: 1 }, undefined)).toBe(false);
  });

  it('refuses a token without iat once the user has a revocation', () => {
    expect(isRevokedToken({ id: 1 }, revokedAt)).toBe(true);
  });
});

describe('guardRevokedSessions', () => {
  const service = (payload: any) => ({ getToken: vi.fn().mockResolvedValue(payload) });

  it('turns a revoked token into an anonymous one (like an expired token)', async () => {
    const jwt = service({ id: 7, iat: at('2026-11-15T10:00:00.000Z') });
    const findRevokedAt = vi.fn().mockResolvedValue(revokedAt);
    guardRevokedSessions(jwt, findRevokedAt);
    expect(await jwt.getToken({})).toEqual({});
    expect(findRevokedAt).toHaveBeenCalledWith(7);
  });

  it('keeps a valid token as it is', async () => {
    const payload = { id: 7, iat: at('2026-11-16T13:00:00.000Z') };
    const jwt = service(payload);
    guardRevokedSessions(jwt, vi.fn().mockResolvedValue(revokedAt));
    expect(await jwt.getToken({})).toBe(payload);
  });

  it('does not look anything up without a token', async () => {
    const jwt = service(null);
    const findRevokedAt = vi.fn();
    guardRevokedSessions(jwt, findRevokedAt);
    expect(await jwt.getToken({})).toBeNull();
    expect(findRevokedAt).not.toHaveBeenCalled();
  });
});
