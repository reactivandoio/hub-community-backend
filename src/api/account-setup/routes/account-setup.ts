/**
 * account-setup router
 *
 * No `auth` config on purpose: Strapi derives the scope `api::account-setup.account-setup.setup`,
 * which no role is granted. Anonymous and logged-in users get 401/403; a full-access API token
 * (or a custom one with that action) gets through.
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/account-setup',
      handler: 'account-setup.setup',
      config: {},
    },
  ],
};
