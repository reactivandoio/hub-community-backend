/**
 * Guard for the users-permissions `PUT /api/users/:id` (controller `user.update`).
 *
 * The plugin route has no ownership check: with `user.update` granted to `authenticated`, any
 * logged-in user could edit any other user — and set their own `role` to `admin`. For a request
 * authenticated with a user JWT this allows only the user's own record and refuses the fields
 * that only the Hub admin (through the bff, with the integration API token) may change. Requests
 * with an API token are left as they are.
 */

export const PROTECTED_USER_FIELDS = [
  'role',
  'blocked',
  'confirmed',
  'provider',
  'resetPasswordToken',
  'confirmationToken',
  'password_pending',
] as const;

export type UserUpdateCheck = {
  strategy?: string | null;
  authUserId?: number | string | null;
  paramId?: number | string | null;
  body?: Record<string, unknown> | null;
};

/** Returns why the update is refused, or null when it may go on. */
export const userUpdateRefusal = ({ strategy, authUserId, paramId, body }: UserUpdateCheck): string | null => {
  if (strategy !== 'users-permissions') return null;
  if (authUserId == null || String(authUserId) !== String(paramId)) {
    return 'You can only update your own user';
  }
  const fields = Object.keys(body ?? {}).filter((field) =>
    (PROTECTED_USER_FIELDS as readonly string[]).includes(field));
  return fields.length > 0 ? `These fields cannot be changed here: ${fields.join(', ')}` : null;
};

/** Wraps the users-permissions `user` controller's `update` (called from register()). */
export const wrapUserUpdate = (originalUpdate: (ctx: any) => Promise<unknown>) =>
  async (ctx: any) => {
    const refusal = userUpdateRefusal({
      strategy: ctx.state?.auth?.strategy?.name,
      authUserId: ctx.state?.user?.id,
      paramId: ctx.params?.id,
      body: ctx.request?.body,
    });
    if (refusal) return ctx.forbidden(refusal);
    return originalUpdate(ctx);
  };
