/**
 * login-code service (REA-26) — wires the pure helpers to Strapi.
 *
 * Codes are stored as HMAC-SHA256(email:code) keyed by LOGIN_CODE_SECRET (falls back to the
 * users-permissions JWT secret), never in clear. The session is a regular users-permissions JWT,
 * the same the bff already verifies.
 */

import crypto from 'crypto';

import { requestLoginCode, verifyLoginCode, CODE_LENGTH } from './login-code-helpers';

const CODE_UID = 'api::login-code.login-code';
const USER_UID = 'plugin::users-permissions.user';

// What the bff needs right after the login (same fields its signIn used to return).
const USER_FIELDS = [
  'id',
  'documentId',
  'username',
  'email',
  'name',
  'phone',
  'cpf',
  'date_of_birth',
  'adult_declaration',
  'adult_declaration_at',
];

const secret = () =>
  process.env.LOGIN_CODE_SECRET || strapi.config.get('plugin::users-permissions.jwtSecret') || process.env.JWT_SECRET || '';

const hash = (email: string, code: string) =>
  crypto.createHmac('sha256', secret()).update(`${email}:${code}`).digest('hex');

const sameHash = (a: string, b: string) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const randomCode = () => String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

const findUser = (email: string) =>
  strapi.db.query(USER_UID).findOne({
    where: { email: { $eqi: email } },
    select: ['id', 'blocked', 'confirmed', 'password_pending'],
  });

const activeWhere = (email: string) => ({ email, consumed_at: { $null: true } });

export default ({ strapi }: { strapi: any }) => ({
  async request(email: string) {
    const codes = strapi.db.query(CODE_UID);
    return requestLoginCode(email, {
      findUser,
      codesSince: async (address, since) =>
        (
          await codes.findMany({
            where: { email: address, createdAt: { $gte: since } },
            select: ['createdAt'],
          })
        ).map((row: any) => row.createdAt),
      invalidateCodes: (address, now) =>
        codes.updateMany({ where: activeWhere(address), data: { consumed_at: now } }),
      createCode: (data) => codes.create({ data: { ...data, attempts: 0 } }),
      randomCode,
      hash,
    });
  },

  async verify(email: string, code: unknown) {
    const codes = strapi.db.query(CODE_UID);
    const userService = strapi.plugin('users-permissions').service('user');

    const result = await verifyLoginCode(email, code, {
      findActiveCode: (address) =>
        codes.findOne({ where: activeWhere(address), orderBy: { createdAt: 'desc' } }),
      setAttempts: (id, attempts) => codes.update({ where: { id }, data: { attempts } }),
      consumeCode: (id, now) => codes.update({ where: { id }, data: { consumed_at: now } }),
      hash,
      sameHash,
      findUser,
      usernameExists: async (username) =>
        (await strapi.db.query(USER_UID).count({ where: { username } })) > 0,
      createUser: async (data) => {
        const role = await strapi.db
          .query('plugin::users-permissions.role')
          .findOne({ where: { type: 'authenticated' } });
        return userService.add({ ...data, role: role?.id });
      },
      updateUser: (id, data) => userService.edit(id, data),
      randomHex: (bytes) => crypto.randomBytes(bytes).toString('hex'),
    });

    if (result.status !== 'ok') return result;

    const user = await strapi.db.query(USER_UID).findOne({
      where: { id: result.userId },
      select: USER_FIELDS,
    });
    const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: result.userId });
    return { status: 'ok', created: result.created, jwt, user };
  },
});
