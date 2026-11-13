/**
 * login-code controller (REA-26) — called only by the bff (integration API token).
 *
 * POST /api/login-code/request { email }
 *   → { status: 'sent', code, expiresAt } | { status: 'cooldown', retryAfter } | { status: 'limit' }
 *     | { status: 'blocked' }. The bff e-mails the code and never shows it to anybody.
 * POST /api/login-code/verify { email, code }
 *   → { status: 'ok', jwt, user, created } | { status: 'invalid', attemptsLeft } | { status: 'expired' }
 *     | { status: 'blocked' }
 * An invalid e-mail answers 400.
 */

import { InvalidEmailError } from '../../account-setup/services/account-setup-helpers';

const service = () => strapi.service('api::login-code.login-code');

export default {
  async request(ctx: any) {
    const { email } = ctx.request.body || {};
    try {
      ctx.body = await service().request(email);
    } catch (err) {
      if (err instanceof InvalidEmailError) return ctx.badRequest(err.message);
      throw err;
    }
  },

  async verify(ctx: any) {
    const { email, code } = ctx.request.body || {};
    try {
      ctx.body = await service().verify(email, code);
    } catch (err) {
      if (err instanceof InvalidEmailError) return ctx.badRequest(err.message);
      throw err;
    }
  },
};
