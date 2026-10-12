/**
 * yarn roles:check — shows which roles and permissions the next start would add
 * (src/roles/ensure-roles), without writing them.
 *
 * Loads the app with ROLES_DRY_RUN=true: the bootstrap logs the plan and stops before
 * anything else. Note that loading Strapi still syncs the database schema with the code,
 * as every start does. Run it from the app directory, with the same .env as the server.
 */
process.env.ROLES_DRY_RUN = 'true';

const { createStrapi, compileStrapi } = require('@strapi/strapi');

(async () => {
  const app = await createStrapi(await compileStrapi()).load();
  await app.destroy();
  process.exit(0);
})().catch((err) => {
  console.error('[roles:dry-run] Failed:', err.message);
  process.exit(1);
});
