/**
 * REA-56: the content API answers reads to anybody the role permissions allow, and some public
 * collections carry personal data in their own fields (speaker.email) or pull it in a populate.
 * The role permissions (src/roles) cut the collections of people; this cuts the fields, whatever
 * the collection, so a permission granted by hand later does not leak them again.
 *
 * Only reads (GET) of the content API (/api/...) are touched, and only when the caller is not the
 * BFF (API token): an anonymous caller or a signed-in person through the Strapi REST API. Left
 * alone: GET /api/users/me (one's own profile) and the auth routes (/api/auth/..., /api/connect/...),
 * which answer the person who is logging in.
 */

export const PERSONAL_KEYS = new Set([
  'email',
  'phone',
  'phone_number',
  'cpf',
  'date_of_birth',
  'whatsapp',
  'respondent_email',
  'volunteer_email',
  'volunteer_phone',
  'created_by_email',
  'invited_by_email',
  'actor_email',
  'target_email',
  'user_email',
  'ip_address',
  'fingerprint',
  'token_hash',
  'token_ciphertext',
  'token_hint',
]);

const OWN_DATA_PATHS = [/^\/api\/users\/me\/?$/, /^\/api\/auth\//, /^\/api\/connect\//];

export const shouldHidePersonalData = (ctx: any): boolean => {
  if (ctx?.method !== 'GET') return false;
  const path = String(ctx?.path || '');
  if (!path.startsWith('/api/')) return false;
  if (OWN_DATA_PATHS.some((re) => re.test(path))) return false;
  return ctx?.state?.auth?.strategy?.name !== 'api-token';
};

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

/** A copy of `value` without the personal keys, at any depth (plain objects and arrays only). */
export const stripPersonalData = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripPersonalData);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (PERSONAL_KEYS.has(key)) continue;
    out[key] = stripPersonalData(child);
  }
  return out;
};

