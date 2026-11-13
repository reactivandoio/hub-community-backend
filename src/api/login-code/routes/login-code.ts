/**
 * login-code router (REA-26)
 *
 * No `auth` config on purpose, like account-setup: the derived scopes
 * `api::login-code.login-code.request` / `.verify` are granted to no role, so only the bff's
 * integration API token gets through. The person never calls these directly.
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/login-code/request',
      handler: 'login-code.request',
      config: {},
    },
    {
      method: 'POST',
      path: '/login-code/verify',
      handler: 'login-code.verify',
      config: {},
    },
  ],
};
