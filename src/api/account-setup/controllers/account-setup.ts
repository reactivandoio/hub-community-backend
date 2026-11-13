/**
 * account-setup controller
 *
 * Called only by the bff (integration API token) when someone signs up to an event without being
 * logged in: makes sure the account exists and says whether it still has a pending registration
 * (`{ created, pending }`), for the bff's "conclua seu cadastro" e-mail (REA-26: login by code).
 */

import { InvalidEmailError } from '../services/account-setup-helpers';

export default {
  async setup(ctx: any) {
    const { email, name, phone } = ctx.request.body || {};

    try {
      ctx.body = await strapi.service('api::account-setup.account-setup').setup({ email, name, phone });
    } catch (err) {
      if (err instanceof InvalidEmailError) {
        return ctx.badRequest(err.message);
      }
      throw err;
    }
  },

  // REA-22: { accounts: [{ email, pending }] } for the e-mails that have an account. The
  // certificate needs a finished registration (e-mail verified by a login code, REA-26).
  async status(ctx: any) {
    const { emails } = ctx.request.body || {};
    ctx.body = { accounts: await strapi.service('api::account-setup.account-setup').status(emails) };
  },
};
