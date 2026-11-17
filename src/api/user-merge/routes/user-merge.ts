/**
 * user-merge router (REA-96)
 *
 * No `auth` config on purpose (like account-setup): Strapi derives the scopes
 * `api::user-merge.user-merge.<handler>`, which no role is granted (and the public role has them in
 * its revoke list). Only a full-access API token — the bff's — gets through.
 */

export default {
  routes: [
    { method: 'GET', path: '/user-merges/duplicates', handler: 'user-merge.duplicates', config: {} },
    { method: 'GET', path: '/user-merges/preview', handler: 'user-merge.preview', config: {} },
    { method: 'POST', path: '/user-merges', handler: 'user-merge.merge', config: {} },
  ],
};
