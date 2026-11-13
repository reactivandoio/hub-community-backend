import { describe, expect, it, vi } from 'vitest';

import { CLOSED_AUTH_ACTIONS, PASSWORD_LOGIN_CLOSED, closePasswordLogin } from './password-login-guard';

const ctxFor = (params: Record<string, string> = {}) => ({
  params,
  request: { body: { identifier: 'ana@x.io', password: 'x' } },
  notFound: vi.fn((message: string) => ({ status: 404, message })),
});

const controller = () => ({
  callback: vi.fn(async () => 'callback'),
  register: vi.fn(async () => 'register'),
  forgotPassword: vi.fn(async () => 'forgot'),
  resetPassword: vi.fn(async () => 'reset'),
  changePassword: vi.fn(async () => 'change'),
  connect: vi.fn(async () => 'connect'),
  emailConfirmation: vi.fn(async () => 'confirmed'),
});

describe('closePasswordLogin (REA-46)', () => {
  it('refuses POST /auth/local (no provider) and GET /auth/local/callback', async () => {
    const auth = controller();
    const original = auth.callback;
    closePasswordLogin(auth);

    for (const params of [{}, { provider: 'local' }]) {
      const ctx = ctxFor(params);
      await auth.callback(ctx);
      expect(ctx.notFound).toHaveBeenCalledWith(PASSWORD_LOGIN_CLOSED);
    }
    expect(original).not.toHaveBeenCalled();
  });

  it('keeps the callback of the other providers (Google, phase 2)', async () => {
    const auth = controller();
    const original = auth.callback;
    closePasswordLogin(auth);
    const ctx = ctxFor({ provider: 'google' });
    await expect(auth.callback(ctx)).resolves.toBe('callback');
    expect(original).toHaveBeenCalledWith(ctx);
    expect(ctx.notFound).not.toHaveBeenCalled();
  });

  it('refuses signup, forgot, reset and change password without running them', async () => {
    const auth = controller();
    const originals = CLOSED_AUTH_ACTIONS.map((action) => auth[action]);
    closePasswordLogin(auth);
    for (const action of CLOSED_AUTH_ACTIONS) {
      const ctx = ctxFor();
      await auth[action](ctx);
      expect(ctx.notFound).toHaveBeenCalledWith(PASSWORD_LOGIN_CLOSED);
    }
    for (const original of originals) expect(original).not.toHaveBeenCalled();
  });

  it('leaves connect and the e-mail confirmation alone', () => {
    const auth = controller();
    const { connect, emailConfirmation } = auth;
    closePasswordLogin(auth);
    expect(auth.connect).toBe(connect);
    expect(auth.emailConfirmation).toBe(emailConfirmation);
  });
});
