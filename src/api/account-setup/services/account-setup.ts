/**
 * account-setup service
 *
 * Wires the pure `setupAccount` to Strapi. Users are created through the users-permissions
 * `user` service so the random password gets hashed like any other.
 */

import crypto from 'crypto';

import { setupAccount, SetupAccountInput } from './account-setup-helpers';

const USER_UID = 'plugin::users-permissions.user';

export default ({ strapi }: { strapi: any }) => ({
  async setup(input: SetupAccountInput) {
    const userService = strapi.plugin('users-permissions').service('user');

    return setupAccount(input, {
      findUserByEmail: (email) =>
        strapi.db.query(USER_UID).findOne({ where: { email: { $eqi: email } } }),
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
  },
});
