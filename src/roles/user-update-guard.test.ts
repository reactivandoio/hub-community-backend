import { describe, expect, it, vi } from 'vitest';

import { userUpdateRefusal, wrapUserUpdate } from './user-update-guard';

const jwt = { strategy: 'users-permissions', authUserId: 7 };

describe('userUpdateRefusal', () => {
  it('lets a user edit their own profile fields', () => {
    expect(userUpdateRefusal({ ...jwt, paramId: '7', body: { name: 'Ana', phone: '1' } })).toBeNull();
  });

  it('refuses editing somebody else', () => {
    expect(userUpdateRefusal({ ...jwt, paramId: '8', body: { name: 'x' } })).toMatch(/own user/);
  });

  it('refuses changing their own role or other protected fields', () => {
    expect(userUpdateRefusal({ ...jwt, paramId: 7, body: { role: 3 } })).toMatch(/role/);
    expect(userUpdateRefusal({ ...jwt, paramId: 7, body: { blocked: false, confirmed: true } }))
      .toMatch(/blocked, confirmed/);
  });

  it('refuses a JWT request without a user', () => {
    expect(userUpdateRefusal({ strategy: 'users-permissions', authUserId: null, paramId: 7, body: {} }))
      .toMatch(/own user/);
  });

  it('leaves API-token requests (the bff integration token) alone', () => {
    expect(userUpdateRefusal({ strategy: 'api-token', paramId: 8, body: { role: 3 } })).toBeNull();
  });
});

describe('wrapUserUpdate', () => {
  const ctxOf = (strategy: string, userId: number | null, id: string, body: object) => ({
    state: { auth: { strategy: { name: strategy } }, user: userId == null ? undefined : { id: userId } },
    params: { id },
    request: { body },
    forbidden: vi.fn(),
  });

  it('answers 403 without calling the plugin controller', async () => {
    const original = vi.fn();
    const ctx = ctxOf('users-permissions', 7, '7', { role: 3 });
    await wrapUserUpdate(original)(ctx);
    expect(original).not.toHaveBeenCalled();
    expect(ctx.forbidden).toHaveBeenCalled();
  });

  it('calls the plugin controller when allowed', async () => {
    const original = vi.fn().mockResolvedValue('ok');
    const ctx = ctxOf('users-permissions', 7, '7', { name: 'Ana' });
    expect(await wrapUserUpdate(original)(ctx)).toBe('ok');
    expect(ctx.forbidden).not.toHaveBeenCalled();
  });
});
