/**
 * REA-46: the Hub has no password since the login by a code sent to the e-mail (REA-26). The
 * users-permissions plugin still serves its password routes, which would let anyone create an
 * account, log in or reset a password around the code. This closes them in the controller, so the
 * routes answer 404 whatever the role permissions say:
 *
 * - POST /auth/local (and GET /auth/local/callback): `auth.callback` with the `local` provider;
 * - POST /auth/local/register: `auth.register`;
 * - POST /auth/forgot-password, /auth/reset-password, /auth/change-password.
 *
 * Left open: `auth.callback` of the other providers and `auth.connect` (the Google login, phase 2),
 * and the e-mail confirmation routes. Nothing else depends on these routes: the login code issues
 * its JWT with the plugin's jwt service, the BFF uses an API token, and the Strapi admin has its
 * own login under /admin.
 */

export const PASSWORD_LOGIN_CLOSED =
  'O login com senha foi desativado. Entre com o código enviado ao seu e-mail.';

export const CLOSED_AUTH_ACTIONS = ['register', 'forgotPassword', 'resetPassword', 'changePassword'] as const;

type Handler = (ctx: any, ...rest: any[]) => Promise<unknown>;

const refuse = (ctx: any) => ctx.notFound(PASSWORD_LOGIN_CLOSED);

/** Changes the users-permissions `auth` controller in place (called from register()). */
export const closePasswordLogin = (authController: Record<string, Handler>) => {
  const callback = authController.callback;
  authController.callback = async (ctx: any, ...rest: any[]) => {
    // The plugin reads the provider the same way: no param means POST /auth/local.
    const provider = ctx.params?.provider || 'local';
    if (provider === 'local') return refuse(ctx);
    return callback(ctx, ...rest);
  };
  for (const action of CLOSED_AUTH_ACTIONS) {
    authController[action] = async (ctx: any) => refuse(ctx);
  }
};
