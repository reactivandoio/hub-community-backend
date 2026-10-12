/**
 * account-setup controller
 *
 * Called only by the bff (integration API token) when someone signs up to an event without a
 * password: makes sure the account exists and returns the token for the "Crie sua senha" link.
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
  // certificate needs a finished registration (password created).
  async status(ctx: any) {
    const { emails } = ctx.request.body || {};
    ctx.body = { accounts: await strapi.service('api::account-setup.account-setup').status(emails) };
  },
};
