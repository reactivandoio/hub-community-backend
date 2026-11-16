/**
 * REA-63: ending every session of a user at once.
 *
 * The Hub's sessions are users-permissions JWTs (login by code, REA-26), valid for 30 days and
 * never stored, so there was no way to end them. `sessions_revoked_at` on the user marks the
 * moment: a token issued before it is treated like an expired one (anonymous), here in Strapi and
 * in the bff (utils/auth). The bff stamps it when the admin changes the user's e-mail, since whoever
 * owns the wrong address may have logged in with a code sent there.
 */

type TokenPayload = { id?: number | string; iat?: number } | null | undefined;

/** True when the token was issued before the user's sessions were revoked. */
export const isRevokedToken = (payload: TokenPayload, revokedAt: string | Date | null | undefined) => {
  if (!revokedAt) return false;
  const revokedSeconds = Math.floor(new Date(revokedAt).getTime() / 1000);
  if (!Number.isFinite(revokedSeconds)) return false;
  // iat has whole seconds: a token issued in the same second as the revocation came after it.
  return typeof payload?.iat !== 'number' || payload.iat < revokedSeconds;
};

type JwtService = { getToken: (ctx: any) => Promise<TokenPayload> | TokenPayload };

/**
 * Wraps the users-permissions `jwt` service's getToken (called from register()). A revoked token
 * answers `{}` — no id — which the plugin's strategy treats as not authenticated, exactly as it
 * does for an expired token.
 */
export const guardRevokedSessions = (
  jwtService: JwtService,
  findRevokedAt: (userId: number | string) => Promise<string | Date | null | undefined>,
) => {
  const getToken = jwtService.getToken.bind(jwtService);
  jwtService.getToken = async (ctx: any) => {
    const payload = await getToken(ctx);
    if (!payload || payload.id === undefined) return payload;
    const revokedAt = await findRevokedAt(payload.id);
    return isRevokedToken(payload, revokedAt) ? {} : payload;
  };
};
